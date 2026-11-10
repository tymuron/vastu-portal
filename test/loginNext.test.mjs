// Back to the lesson after signing in (src/lib/loginNext.ts, loaded straight
// into Node, which strips the types).

import test from 'node:test';
import assert from 'node:assert/strict';
import { loginPathFor, safeNext } from '../src/lib/loginNext.ts';

const LESSON = '/student/week/w-1/day/d-1?course=c-1';

test('a signed-out student on a lesson link goes to login with the lesson to come back to', () => {
    assert.equal(loginPathFor('/student/week/w-1/day/d-1', '?course=c-1'), `/login?next=${encodeURIComponent(LESSON)}`);
    assert.equal(safeNext(new URLSearchParams(loginPathFor('/student/week/w-1/day/d-1', '?course=c-1').split('?')[1]).get('next')), LESSON);
});

test('the course home needs no return trip', () => {
    assert.equal(loginPathFor('/student', ''), '/login');
    assert.equal(loginPathFor('/student/', ''), '/login');
});

test('only the student area is accepted after login, never another site', () => {
    assert.equal(safeNext(LESSON), LESSON);
    assert.equal(safeNext('/student/streams'), '/student/streams');
    for (const bad of [null, undefined, '', 'https://evil.example', '//evil.example', '/student//evil.example', '/\\evil.example',
        '/student\\..\\x', '/studentx', '/teacher', '/student/ x', `/student/${'a'.repeat(600)}`]) {
        assert.equal(safeNext(bad), null, String(bad));
    }
});
