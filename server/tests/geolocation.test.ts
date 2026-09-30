import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countryForIp, resolveSignInCountry } from '../src/services/geolocation.js';
import { profileFor } from '../src/domain/jurisdiction.js';

describe('country resolution', () => {
  it('resolves IPv4 and IPv6 locally', () => {
    assert.equal(countryForIp('8.8.8.8'), 'US');
    assert.equal(countryForIp('::ffff:8.8.8.8'), 'US');
    assert.equal(countryForIp('2001:4860:4860::8888'), 'US');
  });
  it('falls back for private, missing and malformed addresses', () => {
    for (const ip of [undefined, '127.0.0.1', '::1', '192.168.1.10', 'invalid']) {
      assert.equal(countryForIp(ip), null);
    }
    assert.equal(resolveSignInCountry('127.0.0.1', 'DE', 'locale'), 'DE');
    assert.equal(resolveSignInCountry(undefined), 'ZZ');
  });
  it('prefers GPS over IP and IP over a device region', () => {
    assert.equal(resolveSignInCountry('8.8.8.8', 'NG', 'gps'), 'NG');
    assert.equal(resolveSignInCountry('8.8.8.8', 'NG', 'locale'), 'US');
    assert.equal(resolveSignInCountry('8.8.8.8', undefined), 'US');
  });
  it('never assigns a missing country to Norway or Nigeria', () => {
    assert.equal(profileFor(null).code, 'ZZ');
    assert.equal(profileFor('IS').name, 'Iceland');
  });
});
