'use strict';

// The one place that defines "a course this student can still see in the
// Learning Hub" for every student-facing tracking/insight query (Dashboard,
// Analytics, personalization). Must match learningModel.listSubjectsForUser's
// own rule exactly — deleted_at only. An admin-archived-but-not-deleted
// course is a separate, pre-existing gap the Hub's own course list doesn't
// filter on either, so this intentionally doesn't either; fixing that is a
// different task since it touches what the Hub itself shows.
function subjectVisibleClause(alias = 's') {
  return `${alias}.deleted_at IS NULL`;
}

// A quiz's course, if it has one: a formal module_checkpoint/course_final
// carries its subject_id directly on the quizzes row; a practice quiz
// generated from a lesson or topic resolves it by walking
// source_type/source_id down through modules; a chat/resource/manual-sourced
// quiz is never tied to a course and must always stay visible regardless.
// `quizAlias` is the quizzes table's alias in the caller's query — the join
// aliases below are namespaced (qsv_*) so they never collide with it.
function quizSubjectJoins(quizAlias) {
  return `
    LEFT JOIN lessons qsv_l ON ${quizAlias}.source_type = 'lesson' AND qsv_l.id = ${quizAlias}.source_id
    LEFT JOIN topics qsv_t ON (${quizAlias}.source_type = 'topic' AND qsv_t.id = ${quizAlias}.source_id)
      OR (${quizAlias}.source_type = 'lesson' AND qsv_t.id = qsv_l.topic_id)
    LEFT JOIN modules qsv_m ON qsv_m.id = qsv_t.module_id
    LEFT JOIN subjects qsv_s ON qsv_s.id = COALESCE(${quizAlias}.subject_id, qsv_m.subject_id)
  `;
}

// Pairs with quizSubjectJoins(): true when the quiz has no course at all
// (qsv_s.id IS NULL) or its course is still visible.
const QUIZ_SUBJECT_VISIBLE_CONDITION = '(qsv_s.id IS NULL OR qsv_s.deleted_at IS NULL)';

module.exports = { subjectVisibleClause, quizSubjectJoins, QUIZ_SUBJECT_VISIBLE_CONDITION };
