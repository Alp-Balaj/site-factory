import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTime, normaliseHours, parseHours } from './hours.mjs';

test('parseHours converts Albanian p.d./m.d. to 24h', () => {
  assert.deepEqual(parseHours(['e hënë: 8:00 p.d. – 11:00 m.d.']), [{ day: 'e hënë', time: '08:00 - 23:00' }]);
  assert.deepEqual(parseHours(['e diel: 12:00 m.d. – 12:00 p.d.']), [{ day: 'e diel', time: '12:00 - 00:00' }]);
  assert.deepEqual(parseHours(['e shtunë: 9:30 p.d. – 1:00 m.d.']), [{ day: 'e shtunë', time: '09:30 - 13:00' }]);
});

test('parseHours keeps 24h input, pads hours and normalises the dash', () => {
  assert.deepEqual(parseHours(['e martë: 07:00–22:00']), [{ day: 'e martë', time: '07:00 - 22:00' }]);
  assert.deepEqual(parseHours(['e martë: 7:00 - 22:00']), [{ day: 'e martë', time: '07:00 - 22:00' }]);
});

test('parseHours marks a day without a time as closed', () => {
  assert.deepEqual(parseHours(['e diel: Mbyllur']), [{ day: 'e diel', time: 'Mbyllur' }]);
  assert.deepEqual(parseHours(['e diel']), [{ day: 'e diel', time: 'Mbyllur' }]);
});

test('cleanTime is idempotent', () => {
  const once = cleanTime('8:00 p.d. – 11:00 m.d.');
  assert.equal(once, '08:00 - 23:00');
  assert.equal(cleanTime(once), once);
});

test('normaliseHours rewrites config hours and leaves closed days alone', () => {
  assert.deepEqual(
    normaliseHours([{ day: 'e hënë', time: '8:00 p.d. – 11:00 m.d.' }, { day: 'e diel', time: 'Mbyllur' }]),
    [{ day: 'e hënë', time: '08:00 - 23:00' }, { day: 'e diel', time: 'Mbyllur' }],
  );
});
