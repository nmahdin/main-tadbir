<?php

namespace App\Core\Operations\Incidents;

use App\Core\Security\Events\SecurityEventOutcome;
use App\Core\Security\Events\SecurityEventWriter;
use App\Models\User;
use Carbon\CarbonImmutable;
use DomainException;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Lifecycle service for operational incidents and alert deduplication
 * (C7-E). Alerts are fingerprinted; open alerts with the same
 * fingerprint bump occurrence_count rather than creating duplicate
 * incidents.
 */
final class IncidentService
{
    public function __construct(private readonly SecurityEventWriter $events) {}

    /**
     * Open (or return) an alert by fingerprint; create an incident for
     * it if the alert is new.
     *
     * @param  array<string, mixed>|null  $payload
     */
    public function raiseAlert(
        string $source,
        string $fingerprint,
        IncidentSeverity $severity,
        string $title,
        ?string $body = null,
        ?array $payload = null,
    ): CoreAlert {
        return DB::transaction(function () use ($source, $fingerprint, $severity, $title, $body, $payload): CoreAlert {
            $existing = CoreAlert::query()
                ->where('fingerprint', $fingerprint)
                ->whereIn('status', [AlertStatus::OPEN->value, AlertStatus::ACKNOWLEDGED->value])
                ->first();
            if ($existing) {
                $existing->occurrence_count = (int) $existing->occurrence_count + 1;
                $existing->last_observed_at = now();
                if ($body !== null) {
                    $existing->body = $body;
                }
                $existing->save();

                CoreIncidentActivity::create([
                    'incident_id' => $existing->incident_id,
                    'actor_user_id' => null,
                    'event_type' => 'alert.occurrence',
                    'payload' => ['source' => $source, 'occurrence_count' => $existing->occurrence_count],
                ]);

                return $existing;
            }

            $incident = CoreIncident::create([
                'reference' => $this->allocateReference('INC'),
                'title' => $title,
                'severity' => $severity->value,
                'status' => IncidentStatus::OPEN->value,
                'source' => $source,
                'summary' => $body,
                'opened_at' => now(),
            ]);
            $alert = CoreAlert::create([
                'fingerprint' => $fingerprint,
                'source' => $source,
                'severity' => $severity->value,
                'status' => AlertStatus::OPEN->value,
                'title' => $title,
                'body' => $body,
                'payload' => $payload,
                'incident_id' => $incident->id,
                'occurrence_count' => 1,
                'first_observed_at' => now(),
                'last_observed_at' => now(),
            ]);
            CoreIncidentActivity::create([
                'incident_id' => $incident->id,
                'actor_user_id' => null,
                'event_type' => 'incident.opened',
                'payload' => ['source' => $source, 'fingerprint' => $fingerprint],
            ]);

            CoreAlertDelivery::create([
                'alert_id' => $alert->id,
                'channel' => AlertChannel::LOG->value,
                'status' => 'pending',
            ]);

            return $alert;
        });
    }

    /**
     * Manually open an incident (e.g. operator reports a problem).
     */
    public function openIncident(User $actor, string $title, IncidentSeverity $severity, ?string $summary): CoreIncident
    {
        return $this->openManually($actor, $severity, $title, $summary, 'manual');
    }

    /**
     * Open an incident with explicit source (used by CLI/automation).
     */
    public function openManually(?User $actor, IncidentSeverity $severity, string $title, ?string $summary, string $source = 'manual'): CoreIncident
    {
        return DB::transaction(function () use ($actor, $title, $severity, $summary, $source): CoreIncident {
            $incident = CoreIncident::create([
                'reference' => $this->allocateReference('INC'),
                'title' => $title,
                'severity' => $severity->value,
                'status' => IncidentStatus::OPEN->value,
                'source' => $source,
                'summary' => $summary,
                'opened_by_user_id' => $actor?->id,
                'opened_at' => now(),
            ]);
            CoreIncidentActivity::create([
                'incident_id' => $incident->id,
                'actor_user_id' => $actor?->id,
                'event_type' => 'incident.opened',
                'payload' => ['source' => $source],
            ]);
            $this->events->record('ops.incident.opened', SecurityEventOutcome::SUCCESS, $actor, null, 'ops_incident', $incident->id);

            return $incident;
        });
    }

    public function transition(User $actor, CoreIncident $incident, IncidentStatus $target, ?string $notes = null): CoreIncident
    {
        return DB::transaction(function () use ($actor, $incident, $target, $notes): CoreIncident {
            $current = IncidentStatus::from($incident->status);
            if (! in_array($target, $current->allowedTransitions(), true)) {
                throw new DomainException("Invalid incident transition from {$current->value} to {$target->value}.");
            }
            $now = now();
            $incident->status = $target->value;
            if ($target === IncidentStatus::ACKNOWLEDGED && $incident->acknowledged_at === null) {
                $incident->acknowledged_at = $now;
            }
            if ($target === IncidentStatus::MITIGATED && $incident->mitigated_at === null) {
                $incident->mitigated_at = $now;
            }
            if ($target === IncidentStatus::RESOLVED) {
                $incident->resolved_at = $now;
                $incident->closed_at = $now;
                $incident->resolved_by_user_id = $actor->id;
                if ($notes !== null) {
                    $incident->resolution_notes = $notes;
                }
            }
            $incident->save();
            CoreIncidentActivity::create([
                'incident_id' => $incident->id,
                'actor_user_id' => $actor->id,
                'event_type' => 'incident.'.$target->value,
                'payload' => ['notes' => $notes],
            ]);
            $this->events->record('ops.incident.'.$target->value, SecurityEventOutcome::SUCCESS, $actor, $actor->id, 'ops_incident', $incident->id);

            return $incident;
        });
    }

    public function assign(User $actor, CoreIncident $incident, ?User $assignee): CoreIncident
    {
        $incident->assigned_to_user_id = $assignee?->id;
        $incident->save();
        CoreIncidentActivity::create([
            'incident_id' => $incident->id,
            'actor_user_id' => $actor->id,
            'event_type' => 'incident.assigned',
            'payload' => ['assignee_id' => $assignee?->id],
        ]);

        return $incident;
    }

    public function acknowledgeAlert(User $actor, CoreAlert $alert): CoreAlert
    {
        return DB::transaction(function () use ($actor, $alert): CoreAlert {
            $alert->status = AlertStatus::ACKNOWLEDGED->value;
            $alert->acknowledged_at = now();
            $alert->acknowledged_by_user_id = $actor->id;
            $alert->save();
            if ($alert->incident && $alert->incident->status === IncidentStatus::OPEN->value) {
                $this->transition($actor, $alert->incident, IncidentStatus::ACKNOWLEDGED);
            }

            return $alert;
        });
    }

    public function resolveAlert(CoreAlert $alert): void
    {
        DB::transaction(function () use ($alert): void {
            $alert->status = AlertStatus::RESOLVED->value;
            $alert->resolved_at = now();
            $alert->save();
            if ($alert->incident_id) {
                $openCount = CoreAlert::query()
                    ->where('incident_id', $alert->incident_id)
                    ->whereIn('status', [AlertStatus::OPEN->value, AlertStatus::ACKNOWLEDGED->value])
                    ->count();
                if ($openCount === 0 && $alert->incident && $alert->incident->status !== IncidentStatus::RESOLVED->value) {
                    $incident = $alert->incident;
                    $incident->status = IncidentStatus::RESOLVED->value;
                    $incident->resolved_at = now();
                    $incident->closed_at = now();
                    $incident->save();
                    CoreIncidentActivity::create([
                        'incident_id' => $incident->id,
                        'actor_user_id' => null,
                        'event_type' => 'incident.auto_resolved',
                        'payload' => ['reason' => 'all_alerts_resolved'],
                    ]);
                }
            }
        });
    }

    private function allocateReference(string $prefix): string
    {
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $ym = CarbonImmutable::now('UTC')->format('Ym');
            $prefixRef = "{$prefix}-{$ym}-";
            $last = (int) DB::table('ops_incidents')
                ->where('reference', 'like', $prefixRef.'%')
                ->max(DB::raw('CAST(SUBSTRING(reference, '.(strlen($prefixRef) + 1).') AS UNSIGNED)'));
            $next = str_pad((string) ($last + 1), 5, '0', STR_PAD_LEFT);
            $candidate = $prefixRef.$next;
            if (! CoreIncident::query()->where('reference', $candidate)->exists()) {
                return $candidate;
            }
        }
        throw new RuntimeException('Could not allocate a unique incident reference.');
    }
}
