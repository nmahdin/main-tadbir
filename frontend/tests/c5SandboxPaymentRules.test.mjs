import test from 'node:test';import assert from 'node:assert/strict';
import {sandboxPaymentAllowed,sandboxRedirectAllowed} from '../src/features/commercial/paymentRules.ts';
test('C5 paid payment initiation requires explicit sandbox flag; zero payable remains internal',()=>{
 assert.equal(sandboxPaymentAllowed(250000,false),false);
 assert.equal(sandboxPaymentAllowed(250000,true),true);
 assert.equal(sandboxPaymentAllowed(0,false),true);
});
test('C5 never opens live-provider or unsafe PSP URL in sandbox mode',()=>{
 assert.equal(sandboxRedirectAllowed('zibal','https://gateway.example',true),null);
 assert.equal(sandboxRedirectAllowed('sandbox','https://example.test/callback',false),null);
 assert.equal(sandboxRedirectAllowed('sandbox','javascript:alert(1)',true),null);
 assert.equal(sandboxRedirectAllowed('sandbox','https://example.test/callback',true),'https://example.test/callback');
});
