const ApiError = require('../utils/ApiError');
const resourceModel = require('../models/resourceModel');
const learningModel = require('../models/learningModel');
const { colorForId } = require('../utils/palette');
const { logActivity } = require('../utils/gamification');
const { notifyUser } = require('../utils/notify');
const { callGemini, getResponseText } = require('./geminiClient');
const { extractPdfText, truncateForAi } = require('../utils/pdfText');
const { extractOfficeText } = require('../utils/officeText');
const { deleteStoredFile, getStoredFile, storeResourceFile } = require('./storageService');

const ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    keywords: { type: 'ARRAY', items: { type: 'STRING' } },
    topic: { type: 'STRING' },
    difficulty: { type: 'STRING' },
  },
  required: ['summary', 'keywords', 'topic', 'difficulty'],
};

const IMAGE_ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    transcript: { type: 'STRING' },
    summary: { type: 'STRING' },
    keywords: { type: 'ARRAY', items: { type: 'STRING' } },
    topic: { type: 'STRING' },
    difficulty: { type: 'STRING' },
  },
  required: ['transcript', 'summary', 'keywords', 'topic', 'difficulty'],
};

function decorateSubjects(subjects) {
  return subjects.map((subject) => ({ ...subject, ...colorForId(subject.id) }));
}

function normalizeDifficulty(value) {
  return ['easy', 'medium', 'hard'].includes(value) ? value : 'medium';
}

function stripExtension(filename) {
  return filename.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim() || filename;
}

async function extractTextForType(type, buffer) {
  if (type === 'pdf') {
    return extractPdfText(buffer);
  }
  if (type === 'doc' || type === 'docx' || type === 'pptx' || type === 'ppt') {
    try {
      return await extractOfficeText(buffer, type);
    } catch {
      return '';
    }
  }
  return '';
}

async function analyzeText(extractedText) {
  const payload = await callGemini({
    contents: [{
      role: 'user',
      parts: [{
        text: [
          'Analyze this study document and respond with JSON only.',
          'Provide: a 2-3 sentence summary, 5-8 keywords, the main topic (short phrase), and a difficulty estimate (easy, medium, or hard).',
          '',
          `Document text:\n${truncateForAi(extractedText)}`,
        ].join(' '),
      }],
    }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 512,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: ANALYSIS_SCHEMA,
    },
  });

  return JSON.parse(getResponseText(payload));
}

async function analyzeImage(buffer, mimetype) {
  const payload = await callGemini({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: mimetype, data: buffer.toString('base64') } },
        {
          text: [
            'This image is a study resource (e.g. lecture slide, diagram, or notes).',
            'Respond with JSON only. Provide: a plain-text transcript of any visible text/content,',
            'a 2-3 sentence summary, 5-8 keywords, the main topic (short phrase), and a difficulty estimate (easy, medium, or hard).',
          ].join(' '),
        },
      ],
    }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 768,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: IMAGE_ANALYSIS_SCHEMA,
    },
  });

  return JSON.parse(getResponseText(payload));
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchLinkText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return '';
  const html = await response.text();
  return stripHtml(html).slice(0, 20000);
}

async function assertSubjectOwnership(userId, subjectId) {
  if (!subjectId) return;
  const owned = await learningModel.subjectBelongsToUser(Number(subjectId), userId);
  if (!owned) {
    throw new ApiError(400, 'That course could not be found.');
  }
}

async function listResources(userId, { search = '', type = 'all', sort = 'title' } = {}) {
  const [resources, subjectsMap, subjectsLite] = await Promise.all([
    resourceModel.listResources(userId, { search, type, sort }),
    resourceModel.getResourceSubjectsMap(),
    resourceModel.listSubjectsLite(userId),
  ]);

  const decoratedResources = resources.map((resource) => ({
    id: resource.id,
    title: resource.title,
    type: resource.type,
    file_path: resource.file_path,
    external_url: resource.external_url,
    description: resource.description,
    category_name: resource.category_name,
    view_count: resource.view_count,
    created_at: resource.created_at,
    ai_summary: resource.ai_summary,
    ai_keywords: resource.ai_keywords ? (typeof resource.ai_keywords === 'string' ? JSON.parse(resource.ai_keywords) : resource.ai_keywords) : [],
    ai_topic: resource.ai_topic,
    ai_difficulty: resource.ai_difficulty,
    is_analyzed: Boolean(resource.ai_analyzed_at),
    subjects: (subjectsMap.get(resource.id) || []).map((subject) => ({ ...subject, ...colorForId(subject.id) })),
  }));

  const [recentlyOpened, popular, recommendedRaw] = await Promise.all([
    resourceModel.listRecentlyOpened(userId),
    resourceModel.listPopular(userId),
    resourceModel.listRecommended(userId),
  ]);

  const recommended = recommendedRaw.length ? recommendedRaw : popular;

  return {
    resources: decoratedResources,
    subjects: decorateSubjects(subjectsLite),
    recentlyOpened,
    popular,
    recommended,
  };
}

async function logView(userId, resourceId) {
  const resource = await resourceModel.getResourceById(Number(resourceId), userId);
  if (!resource) {
    throw new ApiError(404, 'Resource not found.');
  }

  await resourceModel.logView(userId, resource.id);
  await logActivity(userId, 'resource_viewed', resource.id, `Viewed resource: ${resource.title}`);
  return { resourceId: resource.id };
}

async function prepareDownload(userId, resourceId) {
  const resource = await resourceModel.getResourceById(Number(resourceId), userId);
  if (!resource) {
    throw new ApiError(404, 'Resource not found.');
  }

  if (!resource.file_path) {
    throw new ApiError(400, 'This resource has no downloadable file (it may be an external link).');
  }

  const storedFile = await getStoredFile(resource.file_path);

  await resourceModel.logView(userId, resource.id);
  await logActivity(userId, 'resource_viewed', resource.id, `Downloaded resource: ${resource.title}`);

  return { ...storedFile, title: resource.title };
}

async function prepareAdminDownload(resourceId) {
  const resource = await resourceModel.getResourceByIdAdmin(Number(resourceId));
  if (!resource) {
    throw new ApiError(404, 'Resource not found.');
  }

  if (!resource.file_path) {
    throw new ApiError(400, 'This resource has no downloadable file (it may be an external link).');
  }

  return { ...(await getStoredFile(resource.file_path)), title: resource.title };
}

async function uploadResource(userId, file, type, { subjectId } = {}) {
  if (!file) {
    throw new ApiError(400, 'Please choose a file to upload.');
  }

  await assertSubjectOwnership(userId, subjectId);

  const title = stripExtension(file.originalname);
  const storedFile = await storeResourceFile(userId, file);
  let resourceId;

  try {
    resourceId = await resourceModel.createUploadedResource({
      uploadedBy: userId,
      title,
      type,
      filePath: storedFile.filePath,
      fileSizeBytes: file.size,
      subjectId: subjectId || null,
    });
  } catch (error) {
    await deleteStoredFile(storedFile.filePath);
    throw error;
  }

  try {
    const buffer = storedFile.buffer;

    if (type === 'image') {
      const analysis = await analyzeImage(buffer, file.mimetype);
      await resourceModel.updateResourceAnalysis(resourceId, {
        extractedText: analysis.transcript || '',
        summary: analysis.summary,
        keywords: analysis.keywords,
        topic: analysis.topic,
        difficulty: normalizeDifficulty(analysis.difficulty),
      });
    } else {
      const extractedText = await extractTextForType(type, buffer);
      if (extractedText) {
        const analysis = await analyzeText(extractedText);
        await resourceModel.updateResourceAnalysis(resourceId, {
          extractedText,
          summary: analysis.summary,
          keywords: analysis.keywords,
          topic: analysis.topic,
          difficulty: normalizeDifficulty(analysis.difficulty),
        });
      }
    }
  } catch {
    // Analysis is best-effort; the file itself is already saved and usable.
  }

  await logActivity(userId, 'resource_viewed', resourceId, `Uploaded resource: ${title}`);
  await notifyUser(userId, {
    type: 'system',
    title: 'Resource ready',
    body: `"${title}" has been processed. Ask AILA about it or generate a quiz from it.`,
  });

  return { id: resourceId, title };
}

async function addLinkResource(userId, { url, title, subjectId } = {}) {
  if (!url) {
    throw new ApiError(400, 'Please provide a link to add.');
  }

  await assertSubjectOwnership(userId, subjectId);

  const resolvedTitle = (title || '').trim() || url;
  const resourceId = await resourceModel.createLinkResource({
    uploadedBy: userId,
    title: resolvedTitle,
    externalUrl: url,
    subjectId: subjectId || null,
  });

  try {
    const extractedText = await fetchLinkText(url);
    if (extractedText) {
      const analysis = await analyzeText(extractedText);
      await resourceModel.updateResourceAnalysis(resourceId, {
        extractedText,
        summary: analysis.summary,
        keywords: analysis.keywords,
        topic: analysis.topic,
        difficulty: normalizeDifficulty(analysis.difficulty),
      });
    }
  } catch {
    // Link analysis is best-effort; the link itself is already saved.
  }

  await logActivity(userId, 'resource_viewed', resourceId, `Added resource link: ${resolvedTitle}`);
  await notifyUser(userId, {
    type: 'system',
    title: 'Resource ready',
    body: `"${resolvedTitle}" has been added. Ask AILA about it or generate a quiz from it.`,
  });

  return { id: resourceId, title: resolvedTitle };
}

async function updateResource(userId, resourceId, { title, subjectId }) {
  const resource = await resourceModel.getOwnedResourceById(Number(resourceId), userId);
  if (!resource) {
    throw new ApiError(404, 'Resource not found.');
  }

  await assertSubjectOwnership(userId, subjectId);
  await resourceModel.updateResourceMeta(Number(resourceId), userId, { title, subjectId });
  return { id: Number(resourceId) };
}

async function deleteResource(userId, resourceId) {
  const filePath = await resourceModel.softDeleteResource(Number(resourceId), userId);
  if (filePath === null) {
    throw new ApiError(404, 'Resource not found.');
  }

  await deleteStoredFile(filePath);
}

module.exports = {
  listResources,
  uploadResource,
  addLinkResource,
  logView,
  prepareDownload,
  prepareAdminDownload,
  updateResource,
  deleteResource,
  deleteStoredFile,
};
