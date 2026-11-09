<?php

namespace App\Core\Modules;

/**
 * Pure dependency-graph resolver over catalog definitions
 * (Stage C4-1). Deterministic: every traversal visits keys in
 * sorted order and topological output breaks ties
 * alphabetically, so results never depend on insertion order.
 *
 * The graph is validated eagerly: unknown prerequisites,
 * self-dependencies, duplicate edges, and cycles are all
 * rejected before any traversal result is trusted.
 */
final class ModuleDependencyResolver
{
    /** @var array<string, list<string>> module key => direct prerequisite keys (sorted) */
    private array $edges = [];

    /**
     * @param  list<ModuleDefinition>  $definitions
     */
    public function __construct(array $definitions)
    {
        foreach ($definitions as $definition) {
            $dependencies = $definition->dependencies;
            sort($dependencies);

            if (count($dependencies) !== count(array_unique($dependencies))) {
                throw new ModuleDependencyException(
                    'duplicate_dependency',
                    "Module [{$definition->key}] declares a duplicate dependency.",
                );
            }
            if (in_array($definition->key, $dependencies, true)) {
                throw new ModuleDependencyException(
                    'self_dependency',
                    "Module [{$definition->key}] cannot depend on itself.",
                );
            }

            $this->edges[$definition->key] = $dependencies;
        }

        foreach ($this->edges as $key => $dependencies) {
            foreach ($dependencies as $dependency) {
                if (! array_key_exists($dependency, $this->edges)) {
                    throw new ModuleDependencyException(
                        'missing_dependency',
                        "Module [{$key}] requires unknown module [{$dependency}].",
                    );
                }
            }
        }

        // Cycle check via the deterministic topological walk.
        $this->topologicalOrder();
    }

    public static function fromCatalog(): self
    {
        return new self(ModuleCatalog::definitions());
    }

    public function has(string $key): bool
    {
        return array_key_exists($key, $this->edges);
    }

    /** @return list<string> */
    public function directPrerequisites(string $key): array
    {
        $this->assertKnown($key);

        return $this->edges[$key];
    }

    /**
     * Transitive prerequisite closure in topological order
     * (every prerequisite appears before its dependents),
     * excluding the module itself.
     *
     * @return list<string>
     */
    public function prerequisitesFor(string $key): array
    {
        $this->assertKnown($key);

        $closure = [];
        $visit = function (string $current) use (&$visit, &$closure): void {
            foreach ($this->edges[$current] as $dependency) {
                if (! isset($closure[$dependency])) {
                    $closure[$dependency] = true;
                    $visit($dependency);
                }
            }
        };
        $visit($key);

        return array_values(array_filter(
            $this->topologicalOrder(),
            fn (string $candidate): bool => isset($closure[$candidate]),
        ));
    }

    /** @return list<string> Modules that directly require the given module (sorted). */
    public function dependentsOf(string $key): array
    {
        $this->assertKnown($key);

        $dependents = [];
        foreach ($this->edges as $candidate => $dependencies) {
            if (in_array($key, $dependencies, true)) {
                $dependents[] = $candidate;
            }
        }
        sort($dependents);

        return $dependents;
    }

    /**
     * Transitive reverse closure: everything that requires the
     * given module directly or indirectly (sorted). The
     * deactivation-safety lookup for C4-2.
     *
     * @return list<string>
     */
    public function allDependentsOf(string $key): array
    {
        $this->assertKnown($key);

        $found = [];
        $queue = $this->dependentsOf($key);
        while ($queue !== []) {
            $current = array_shift($queue);
            if (isset($found[$current])) {
                continue;
            }
            $found[$current] = true;
            $queue = [...$queue, ...$this->dependentsOf($current)];
        }

        $result = array_keys($found);
        sort($result);

        return $result;
    }

    /**
     * Full deterministic topological order (prerequisites
     * first). Throws on cycles.
     *
     * @return list<string>
     */
    public function topologicalOrder(): array
    {
        $inDegree = [];
        $dependents = [];
        foreach ($this->edges as $key => $dependencies) {
            $inDegree[$key] = count($dependencies);
            foreach ($dependencies as $dependency) {
                $dependents[$dependency][] = $key;
            }
        }

        $ready = array_keys(array_filter($inDegree, fn (int $degree): bool => $degree === 0));
        sort($ready);

        $order = [];
        while ($ready !== []) {
            $current = array_shift($ready);
            $order[] = $current;
            foreach ($dependents[$current] ?? [] as $dependent) {
                $inDegree[$dependent]--;
                if ($inDegree[$dependent] === 0) {
                    $ready[] = $dependent;
                }
            }
            sort($ready);
        }

        if (count($order) !== count($this->edges)) {
            $cyclic = implode(', ', array_keys(array_filter($inDegree, fn (int $degree): bool => $degree > 0)));
            throw new ModuleDependencyException(
                'dependency_cycle',
                "Module dependency cycle detected among: {$cyclic}.",
            );
        }

        return $order;
    }

    private function assertKnown(string $key): void
    {
        if (! $this->has($key)) {
            throw new ModuleDependencyException('unknown_module', "Module [{$key}] is not in the registry.");
        }
    }
}
