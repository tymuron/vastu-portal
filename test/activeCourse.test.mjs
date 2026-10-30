// Which course a student lands in (src/lib/activeCourse.ts, loaded straight
// into Node, which strips the types).

import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseActiveCourse, parseCoursePick } from '../src/lib/activeCourse.ts';

const BUSINESS = 'course-vastu-2';
const DESIGN = 'course-vastu-design-2026';

test('one course opens by itself', () => {
    assert.equal(chooseActiveCourse('u1', [BUSINESS], null), BUSINESS);
});

test('the course picked last is still open after a reload or a switch to another app', () => {
    // Before: every return to the app reloaded the courses and sent a
    // student with two courses back to the picker.
    const pick = { userId: 'u1', courseId: DESIGN, courseIds: [BUSINESS, DESIGN] };
    assert.equal(chooseActiveCourse('u1', [BUSINESS, DESIGN], pick), DESIGN);
    assert.equal(chooseActiveCourse('u1', [DESIGN, BUSINESS], pick), DESIGN, 'order does not matter');
});

test('no pick yet, or another account\'s pick: the picker', () => {
    assert.equal(chooseActiveCourse('u1', [BUSINESS, DESIGN], null), null);
    assert.equal(chooseActiveCourse('u2', [BUSINESS, DESIGN], { userId: 'u1', courseId: DESIGN, courseIds: [BUSINESS, DESIGN] }), null);
});

test('a course added since the pick brings the picker back, so a new course is noticed', () => {
    // Opened automatically while «Васту для бизнеса» was the only course,
    // then «Васту-дизайн» was bought.
    const pick = { userId: 'u1', courseId: BUSINESS, courseIds: [BUSINESS] };
    assert.equal(chooseActiveCourse('u1', [BUSINESS, DESIGN], pick), null);
});

test('a picked course that is gone (expired, deactivated) is not reopened', () => {
    const pick = { userId: 'u1', courseId: 'expired', courseIds: ['expired', BUSINESS, DESIGN] };
    assert.equal(chooseActiveCourse('u1', [BUSINESS, DESIGN], pick), null);
});

test('a stored pick that is missing or garbled reads as no pick', () => {
    assert.equal(parseCoursePick(null), null);
    assert.equal(parseCoursePick('course-id-from-the-old-format'), null);
    assert.equal(parseCoursePick('{"userId":"u1"}'), null);
    assert.deepEqual(
        parseCoursePick(JSON.stringify({ userId: 'u1', courseId: DESIGN, courseIds: [BUSINESS, DESIGN, 7] })),
        { userId: 'u1', courseId: DESIGN, courseIds: [BUSINESS, DESIGN] },
    );
});
