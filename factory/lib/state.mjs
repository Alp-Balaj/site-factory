// places/<slug>/state.json: one status per Place plus the CRM fields, exactly the shape in the build plan.
// Every status change goes through transition(), which refuses moves not in TRANSITIONS and appends to state.log.
// Every write goes through writeState(), which auto-commits when AUTO_COMMIT=1 (factory/lib/git.mjs).
import fs from 'node:fs';
import { commit } from './git.mjs';
import { readJson, statePath, writeJson } from './paths.mjs';

// Pipeline order; the Portal board renders columns in this order.
export const STATUSES = [
  'found', 'generating', 'qa_failed', 'qa_passed', 'ready', 'shown', 'interested',
  'intake_received', 'paid', 'live', 'churned', 'declined', 'failed',
];

// from -> [to]. Anything not listed throws. Approval is only qa_passed -> ready.
export const TRANSITIONS = {
  found: ['generating'],
  generating: ['qa_passed', 'qa_failed', 'failed'],
  failed: ['found'],
  qa_failed: ['generating', 'declined'],
  qa_passed: ['ready', 'generating'],
  ready: ['shown', 'generating'],
  shown: ['interested', 'declined'],
  interested: ['intake_received', 'declined'],
  intake_received: ['generating', 'paid', 'declined'],
  paid: ['live'],
  live: ['churned', 'generating'],
  churned: [],
  declined: ['found'],
};

export const canTransition = (from, to) => (TRANSITIONS[from] ?? []).includes(to);
export const allowedFrom = (from) => TRANSITIONS[from] ?? [];

// A fresh state. Every field is present with an empty value so the Portal renders a form without guarding.
export function emptyState(status = 'found', patch = {}) {
  if (!STATUSES.includes(status)) throw new Error(`unknown status "${status}"`);
  return {
    status,
    flags: { hasRealWebsite: false, fixture: false, ...(patch.flags ?? {}) },
    archetype: '',
    instagram: { handle: '', how: '' },
    contact: { person: '', phone: '' },
    feedback: '',
    followUp: null,
    priceAgreed: null,
    paidAt: null,
    domain: '',
    pagesUrl: '',
    notes: [],
    qa: null,
    log: [],
    ...Object.fromEntries(Object.entries(patch).filter(([k]) => k !== 'flags' && k !== 'log')),
    ...(patch.log ? { log: patch.log } : {}),
  };
}

export const hasState = (slug) => fs.existsSync(statePath(slug));

// null when the Place has no state.json yet.
export function readState(slug) {
  return readJson(statePath(slug), null);
}

// Writes the whole state and commits it when AUTO_COMMIT=1. Returns the state.
export function writeState(slug, state, message = `state(${slug}): ${state.status}`) {
  const file = statePath(slug);
  writeJson(file, state);
  commit([file], message);
  return state;
}

// Shallow-merges `patch` into the existing state (nested objects like contact are replaced whole, so pass the full object).
export function updateState(slug, patch, message) {
  const state = readState(slug);
  if (!state) throw new Error(`${statePath(slug)} not found`);
  const next = { ...state, ...patch };
  return writeState(slug, next, message ?? `state(${slug}): ${Object.keys(patch).join(', ')}`);
}

// Creates state.json when missing. Returns the state either way.
export function ensureState(slug, status = 'found', reason = 'created', patch = {}) {
  const existing = readState(slug);
  if (existing) return existing;
  const state = emptyState(status, patch);
  state.log.push(logEntry(null, status, reason));
  return writeState(slug, state, `state(${slug}): ${status} (${reason})`);
}

export const logEntry = (from, to, reason) => ({ at: new Date().toISOString(), from, to, reason: reason ?? '' });

// Moves a Place to `to`, or throws when the table forbids it. Appends to state.log and writes.
export function transition(slug, to, reason = '') {
  const state = readState(slug);
  if (!state) throw new Error(`${statePath(slug)} not found`);
  const from = state.status;
  if (!STATUSES.includes(to)) throw new Error(`unknown status "${to}"`);
  if (!canTransition(from, to)) {
    const allowed = allowedFrom(from);
    throw new Error(`${slug}: cannot go from ${from} to ${to}${allowed.length ? ` (allowed: ${allowed.join(', ')})` : ' (final status)'}`);
  }
  state.status = to;
  state.log = [...(state.log ?? []), logEntry(from, to, reason)];
  return writeState(slug, state, `state(${slug}): ${from} -> ${to}${reason ? ` (${reason})` : ''}`);
}

// Adds a timestamped note (the Portal's "notes" field is a list; notes.md is the free-text visit file).
export function addNote(slug, text) {
  const state = readState(slug);
  if (!state) throw new Error(`${statePath(slug)} not found`);
  state.notes = [...(state.notes ?? []), { at: new Date().toISOString(), text }];
  return writeState(slug, state, `state(${slug}): note`);
}
