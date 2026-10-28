'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');

const {
  CURRICULUM_SUBJECT_CODES, OTHERS_LABEL, normalizeCurriculumSubject, curriculumSubjectLabel,
} = require('../../src/utils/curriculumSubject');
const { generateCourseValidator } = require('../../src/validators/learningValidator');
const { registerValidator } = require('../../src/validators/authValidator');
const { updateProfileValidator, isFacebookNameOrLink, isContactNumber } = require('../../src/validators/profileValidator');
const { assertConsoleEmailDriver } = require('../integration/emailGuard');

async function invalidFields(chains, body) {
  const req = { body };
  for (const chain of chains) await chain.run(req);
  return validationResult(req).array().map((error) => error.path);
}

test('curriculum subject config', async (t) => {
  await t.test('lists the 8 placeholder 2nd-year subjects, with "Others" as the no-subject label', () => {
    assert.deepEqual(CURRICULUM_SUBJECT_CODES, ['NCM 104', 'NCM 105', 'NCM 106', 'NCM 107', 'NCM 108', 'NCM 109', 'NCM 110', 'MC 4']);
    assert.equal(OTHERS_LABEL, 'Others');
  });

  await t.test('normalize keeps a listed code and turns everything else into NULL', () => {
    assert.equal(normalizeCurriculumSubject('NCM 106'), 'NCM 106');
    assert.equal(normalizeCurriculumSubject('  MC 4 '), 'MC 4');
    for (const value of ['Others', '', '   ', null, undefined, 'NCM 999', 42]) {
      assert.equal(normalizeCurriculumSubject(value), null, JSON.stringify(value));
    }
  });

  await t.test('label is "<code> <name>", and "Others" for NULL or an unknown code', () => {
    assert.equal(curriculumSubjectLabel('NCM 106'), 'NCM 106 Pharmacology');
    assert.equal(curriculumSubjectLabel(null), 'Others');
    assert.equal(curriculumSubjectLabel('NCM 999'), 'Others');
  });
});

test('generateCourseValidator: curriculumSubject', async (t) => {
  await t.test('accepts a listed code, "Others", "", null, or omitted', async () => {
    for (const curriculumSubject of ['NCM 104', 'MC 4', 'Others', '', null, undefined]) {
      // eslint-disable-next-line no-await-in-loop
      const fields = await invalidFields(generateCourseValidator, { courseName: 'Drug classes', curriculumSubject });
      assert.ok(!fields.includes('curriculumSubject'), JSON.stringify(curriculumSubject));
    }
  });

  await t.test('rejects a code that is not on the list, or a non-string', async () => {
    for (const curriculumSubject of ['NCM 999', 'Pharmacology', 106, ['NCM 106']]) {
      // eslint-disable-next-line no-await-in-loop
      const fields = await invalidFields(generateCourseValidator, { courseName: 'Drug classes', curriculumSubject });
      assert.ok(fields.includes('curriculumSubject'), JSON.stringify(curriculumSubject));
    }
  });
});

test('registerValidator: student number required, middle name optional', async (t) => {
  const base = { first_name: 'Ana', last_name: 'Cruz', email: 'ana@example.com', password: 'Passw0rd!x', program: 'BSN' };

  await t.test('missing or blank student number is invalid', async () => {
    for (const student_number of [undefined, '', '   ']) {
      // eslint-disable-next-line no-await-in-loop
      const fields = await invalidFields(registerValidator, { ...base, student_number });
      assert.ok(fields.includes('student_number'), JSON.stringify(student_number));
    }
  });

  await t.test('middle name may be omitted or empty, but not over 100 characters', async () => {
    for (const middle_name of [undefined, '', 'Dela Paz']) {
      // eslint-disable-next-line no-await-in-loop
      const fields = await invalidFields(registerValidator, { ...base, student_number: '2024-00123', middle_name });
      assert.deepEqual(fields, [], JSON.stringify(middle_name));
    }
    const fields = await invalidFields(registerValidator, { ...base, student_number: '2024-00123', middle_name: 'x'.repeat(101) });
    assert.deepEqual(fields, ['middle_name']);
  });
});

test('profile contact fields', async (t) => {
  await t.test('Facebook accepts a plain name or a facebook.com / fb.com link', () => {
    for (const value of ['Juan Dela Cruz', 'María Santos-Reyes', "O'Neil", 'juan.delacruz',
      'https://www.facebook.com/juan.delacruz', 'facebook.com/profile.php?id=1000', 'm.facebook.com/juan', 'fb.com/juan', 'https://fb.me/juan']) {
      assert.equal(isFacebookNameOrLink(value), true, value);
    }
  });

  await t.test('Facebook rejects other sites, bare domains, and odd characters', () => {
    for (const value of ['https://evil.example.com/me', 'www.example.com', 'facebook.com', 'https://facebook.com/', 'javascript:alert(1)', '<b>me</b>', '', '   ']) {
      assert.equal(isFacebookNameOrLink(value), false, value);
    }
  });

  await t.test('contact number allows digits, spaces, +, - and parentheses with 7-15 digits', () => {
    for (const value of ['09171234567', '+63 917 123 4567', '(02) 8123-4567', '1234567']) {
      assert.equal(isContactNumber(value), true, value);
    }
    for (const value of ['123456', '1'.repeat(16), 'call me', '0917-123-ABCD', '++63 917 123 4567', '']) {
      assert.equal(isContactNumber(value), false, value);
    }
  });

  await t.test('updateProfileValidator lets "" or null clear the new fields', async () => {
    const fields = await invalidFields(updateProfileValidator, { middle_name: '', facebook: '', contact_number: null });
    assert.deepEqual(fields, []);
  });

  await t.test('updateProfileValidator enforces the length limits', async () => {
    const fields = await invalidFields(updateProfileValidator, {
      middle_name: 'x'.repeat(101), facebook: `https://facebook.com/${'a'.repeat(250)}`, contact_number: `+${'1'.repeat(30)}`,
    });
    assert.deepEqual([...new Set(fields)].sort(), ['contact_number', 'facebook', 'middle_name']);
  });
});

test('integration email guard', async (t) => {
  await t.test('allows the console driver (any case/spacing) and an unset driver, which defaults to console', () => {
    for (const EMAIL_DRIVER of ['console', ' Console ', undefined, '']) {
      assert.doesNotThrow(() => assertConsoleEmailDriver({ EMAIL_DRIVER }), String(EMAIL_DRIVER));
    }
  });

  await t.test('refuses any real driver', () => {
    for (const EMAIL_DRIVER of ['smtp', 'resend', 'brevo']) {
      assert.throws(() => assertConsoleEmailDriver({ EMAIL_DRIVER }), /Refusing to run integration tests/, EMAIL_DRIVER);
    }
  });
});
