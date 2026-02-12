"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.githubWebhook = exports.summarize = exports.postUpdate = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const openai_1 = __importDefault(require("openai"));
const generative_ai_1 = require("@google/generative-ai");
admin.initializeApp();
const db = admin.firestore();
// Validate token and get user ID
async function validateToken(token) {
    if (!token) {
        return { valid: false };
    }
    const tokensSnapshot = await db.collectionGroup('agentTokens')
        .where('token', '==', token)
        .where('isRevoked', '==', false)
        .limit(1)
        .get();
    if (!tokensSnapshot.empty) {
        const tokenDoc = tokensSnapshot.docs[0];
        const tokenData = tokenDoc.data();
        const pathParts = tokenDoc.ref.path.split('/');
        const userId = pathParts[1];
        await tokenDoc.ref.update({
            lastUsedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return {
            valid: true,
            userId,
            projectScope: tokenData.projectId || undefined
        };
    }
    return { valid: false };
}
// Check if activity is paused for user
async function isActivityPaused(userId) {
    const settingsDoc = await db.doc(`users/${userId}/settings/preferences`).get();
    if (settingsDoc.exists) {
        const settings = settingsDoc.data();
        return settings?.activityPaused === true;
    }
    return false;
}
// Get user's AI settings
async function getUserAISettings(userId) {
    const settingsDoc = await db.doc(`users/${userId}/settings/ai`).get();
    if (settingsDoc.exists) {
        return settingsDoc.data();
    }
    return {};
}
// Generate summary using the user's configured AI provider
async function generateAISummary(settings, projectName, commitsContext, mode, branchName) {
    const workstreamPrompt = `You are helping a developer remember what they were working on after being away. Summarize the FEATURE or GOAL being built, not individual commits.

Project: ${projectName}
Branch: ${branchName || 'unknown'}

Recent commits on this branch:
${commitsContext}

Respond with JSON only, no other text:
{
  "summary": "What feature/goal is being worked on (present progressive, ~20 words)",
  "actionTag": "one of: needs_attention, question_pending, review_requested, decision_needed, ready_to_merge, blocked, in_progress, or null",
  "workType": "one of: feature, bugfix, refactor, infrastructure, docs, maintenance"
}

Summary guidelines:
- Describe the FEATURE or GOAL, not individual commits
- Use present progressive: "Building...", "Fixing...", "Adding...", "Refactoring..."
- Around 20 words (up to 25 max), enough to capture the goal
- Think: what would you tell someone who asks "what were you working on?"
- Use file paths and branch name as clues about the feature area
- Examples of good summaries:
  - "Building a GitHub Issues to Markdown converter with fallback handling for edge cases"
  - "Fixing authentication flow where sessions expire during OAuth callback"
  - "Adding real-time notifications for agent activity updates across all projects"
  - "Refactoring the webhook pipeline to support multiple event types beyond push"
- Examples of bad summaries:
  - "Updated index.ts and fixed a bug" (too vague, commit-level)
  - "Made changes to the authentication system" (no specifics about the goal)

Action tag guidelines:
- needs_attention: Something requires user action or review
- question_pending: A commit message asked a question or needs clarification
- review_requested: PR or code explicitly needs review
- decision_needed: Needs a yes/no or choice from user
- ready_to_merge: Work appears complete and ready to merge
- blocked: Waiting on external dependency or issue
- in_progress: Actively being worked on, no special attention needed
- null: No clear indicator or general maintenance work

workType guidelines:
- feature: New functionality being added
- bugfix: Fixing broken behavior
- refactor: Restructuring without changing behavior
- infrastructure: CI/CD, build system, deployment, config
- docs: Documentation changes
- maintenance: Dependency updates, cleanup, minor chores`;
    const projectPrompt = `You are helping a developer remember what's happening across a project after being away. Summarize the overall direction and active work.

Project: ${projectName}

Recent activity across all branches:
${commitsContext}

Respond with JSON only, no other text:
{
  "summary": "What is happening in this project overall (~20 words)",
  "actionTag": null,
  "workType": null
}

Summary guidelines:
- Describe the overall project direction, not individual commits
- Use present progressive: "Building...", "Adding...", "Working on..."
- Around 20 words (up to 25 max)
- If multiple features are in progress, mention the 1-2 most significant
- Think: what would you tell someone who asks "what's going on in this project?"
- Examples:
  - "Building a project dashboard with AI summaries and GitHub webhook integration"
  - "Adding multi-provider AI support and improving the branch-level summary experience"`;
    const prompt = mode === 'workstream' ? workstreamPrompt : projectPrompt;
    const provider = settings.aiProvider || 'anthropic';
    const parseResponse = (text) => {
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    summary: parsed.summary || 'Unable to generate summary.',
                    actionTag: parsed.actionTag || null,
                    workType: parsed.workType || null
                };
            }
        }
        catch {
            return { summary: text, actionTag: null, workType: null };
        }
        return { summary: text, actionTag: null, workType: null };
    };
    try {
        if (provider === 'anthropic' && settings.anthropicKey) {
            const client = new sdk_1.default({ apiKey: settings.anthropicKey });
            const message = await client.messages.create({
                model: 'claude-3-haiku-20240307',
                max_tokens: 500,
                messages: [{ role: 'user', content: prompt }]
            });
            const text = message.content[0].type === 'text' ? message.content[0].text : '';
            return parseResponse(text);
        }
        if (provider === 'openai' && settings.openaiKey) {
            const client = new openai_1.default({ apiKey: settings.openaiKey });
            const completion = await client.chat.completions.create({
                model: 'gpt-4o-mini',
                max_tokens: 500,
                messages: [{ role: 'user', content: prompt }]
            });
            const text = completion.choices[0]?.message?.content || '';
            return parseResponse(text);
        }
        if (provider === 'google' && settings.googleKey) {
            const genAI = new generative_ai_1.GoogleGenerativeAI(settings.googleKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const result = await model.generateContent(prompt);
            const text = result.response.text() || '';
            return parseResponse(text);
        }
        return { summary: 'No AI provider configured. Add your API key in Settings.', actionTag: null, workType: null };
    }
    catch (error) {
        console.error(`AI summary error (${provider}):`, error);
        return { summary: 'Failed to generate summary. Check your API key in Settings.', actionTag: null, workType: null };
    }
}
// Create an update for a user
async function createUpdate(userId, project, workstream, summary, tool, model, priority = 'medium', metadata) {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const projectsRef = db.collection('users').doc(userId).collection('projects');
    const projectQuery = await projectsRef.where('name', '==', project).limit(1).get();
    let projectRef;
    if (projectQuery.empty) {
        projectRef = await projectsRef.add({
            name: project,
            createdAt: now,
            lastActivityAt: now
        });
    }
    else {
        projectRef = projectQuery.docs[0].ref;
        await projectRef.update({ lastActivityAt: now });
    }
    const workstreamsRef = projectRef.collection('workstreams');
    const workstreamQuery = await workstreamsRef.where('name', '==', workstream).limit(1).get();
    let workstreamRef;
    if (workstreamQuery.empty) {
        workstreamRef = await workstreamsRef.add({
            name: workstream,
            projectId: projectRef.id,
            status: 'active',
            lastActivityAt: now
        });
    }
    else {
        workstreamRef = workstreamQuery.docs[0].ref;
        await workstreamRef.update({ lastActivityAt: now });
    }
    const updateData = {
        workstreamId: workstreamRef.id,
        projectId: projectRef.id,
        summary,
        tool,
        model,
        priority,
        timestamp: now,
        isRead: false
    };
    if (metadata?.commitBody)
        updateData.commitBody = metadata.commitBody;
    if (metadata?.filesChanged?.length)
        updateData.filesChanged = metadata.filesChanged;
    if (metadata?.commitUrl)
        updateData.commitUrl = metadata.commitUrl;
    const updateRef = await workstreamRef.collection('updates').add(updateData);
    return updateRef.id;
}
// Determine priority from commit message
function getPriorityFromCommit(message) {
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.startsWith('fix') || lowerMsg.startsWith('hotfix') || lowerMsg.includes('!:')) {
        return 'high';
    }
    if (lowerMsg.startsWith('docs') || lowerMsg.startsWith('chore') || lowerMsg.startsWith('style')) {
        return 'low';
    }
    return 'medium';
}
// POST /postUpdate - Agent update endpoint
exports.postUpdate = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    if (req.method !== 'POST') {
        const response = {
            success: false,
            error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST method is allowed' }
        };
        res.status(405).json(response);
        return;
    }
    const token = req.headers['x-agent-token'];
    if (!token) {
        res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'X-Agent-Token header is required' } });
        return;
    }
    const tokenResult = await validateToken(token);
    if (!tokenResult.valid || !tokenResult.userId) {
        res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token is invalid or has been revoked' } });
        return;
    }
    if (await isActivityPaused(tokenResult.userId)) {
        res.status(403).json({ success: false, error: { code: 'ACTIVITY_PAUSED', message: 'Activity tracking is paused.' } });
        return;
    }
    const body = req.body;
    if (!body.project || !body.workstream || !body.summary || !body.tool || !body.model) {
        res.status(400).json({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'Missing required fields' } });
        return;
    }
    if (tokenResult.projectScope && tokenResult.projectScope !== body.project) {
        res.status(403).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token not authorized for this project' } });
        return;
    }
    try {
        const updateId = await createUpdate(tokenResult.userId, body.project, body.workstream, body.summary, body.tool, body.model, body.priority);
        res.status(200).json({ success: true, data: { updateId, timestamp: new Date().toISOString() } });
    }
    catch (error) {
        console.error('Error creating update:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } });
    }
});
// POST /summarize - AI-generated summary for a project or workstream
exports.summarize = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const token = req.headers['x-agent-token'];
    if (!token) {
        res.status(401).json({ error: 'Token required' });
        return;
    }
    const tokenResult = await validateToken(token);
    if (!tokenResult.valid || !tokenResult.userId) {
        res.status(401).json({ error: 'Invalid token' });
        return;
    }
    const { projectId, workstreamId } = req.body;
    if (!projectId) {
        res.status(400).json({ error: 'projectId required' });
        return;
    }
    try {
        const userId = tokenResult.userId;
        // Get user's AI settings
        const aiSettings = await getUserAISettings(userId);
        let updatesData = [];
        let branchName;
        if (workstreamId) {
            // Get branch name from workstream doc
            const wsDoc = await db.doc(`users/${userId}/projects/${projectId}/workstreams/${workstreamId}`).get();
            branchName = wsDoc.data()?.name;
            const updatesRef = db.collection(`users/${userId}/projects/${projectId}/workstreams/${workstreamId}/updates`);
            const updatesSnap = await updatesRef.orderBy('timestamp', 'desc').limit(20).get();
            updatesData = updatesSnap.docs.map(doc => {
                const data = doc.data();
                return {
                    summary: data.summary,
                    timestamp: data.timestamp?.toDate?.()?.toISOString() || '',
                    tool: data.tool,
                    commitBody: data.commitBody,
                    filesChanged: data.filesChanged
                };
            });
        }
        else {
            const workstreamsRef = db.collection(`users/${userId}/projects/${projectId}/workstreams`);
            const workstreamsSnap = await workstreamsRef.get();
            for (const wsDoc of workstreamsSnap.docs) {
                const wsData = wsDoc.data();
                const updatesRef = wsDoc.ref.collection('updates');
                const updatesSnap = await updatesRef.orderBy('timestamp', 'desc').limit(10).get();
                updatesSnap.docs.forEach(doc => {
                    const data = doc.data();
                    updatesData.push({
                        summary: `[${wsData.name}] ${data.summary}`,
                        timestamp: data.timestamp?.toDate?.()?.toISOString() || '',
                        tool: data.tool,
                        commitBody: data.commitBody,
                        filesChanged: data.filesChanged
                    });
                });
            }
            updatesData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            updatesData = updatesData.slice(0, 20);
        }
        if (updatesData.length === 0) {
            res.status(200).json({ success: true, summary: 'No recent activity to summarize.' });
            return;
        }
        const projectDoc = await db.doc(`users/${userId}/projects/${projectId}`).get();
        const projectName = projectDoc.data()?.name || 'Unknown Project';
        // Build enriched context with commit bodies and file paths
        const commitsContext = updatesData.map(u => {
            let line = `- ${u.summary}`;
            if (u.commitBody)
                line += `\n  Body: ${u.commitBody}`;
            if (u.filesChanged?.length)
                line += `\n  Files: ${u.filesChanged.slice(0, 10).join(', ')}${u.filesChanged.length > 10 ? ` (+${u.filesChanged.length - 10} more)` : ''}`;
            return line;
        }).join('\n');
        const mode = workstreamId ? 'workstream' : 'project';
        const result = await generateAISummary(aiSettings, projectName, commitsContext, mode, branchName);
        res.status(200).json({
            success: true,
            summary: result.summary,
            actionTag: result.actionTag,
            workType: result.workType
        });
    }
    catch (error) {
        console.error('Error generating summary:', error);
        res.status(500).json({ error: 'Failed to generate summary' });
    }
});
// POST /githubWebhook - GitHub webhook endpoint
exports.githubWebhook = (0, https_1.onRequest)({ cors: false }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    const token = req.query.token;
    if (!token) {
        res.status(401).json({ error: 'Token required in query parameter' });
        return;
    }
    const tokenResult = await validateToken(token);
    if (!tokenResult.valid || !tokenResult.userId) {
        res.status(401).json({ error: 'Invalid token' });
        return;
    }
    if (await isActivityPaused(tokenResult.userId)) {
        res.status(200).json({ message: 'Activity paused, webhook ignored' });
        return;
    }
    const githubEvent = req.headers['x-github-event'];
    if (githubEvent !== 'push') {
        res.status(200).json({ message: `Event ${githubEvent} ignored` });
        return;
    }
    try {
        const payload = req.body;
        const branch = payload.ref.replace('refs/heads/', '');
        const project = payload.repository.name;
        if (tokenResult.projectScope && tokenResult.projectScope !== project) {
            res.status(200).json({ message: 'Project not in token scope, ignored' });
            return;
        }
        const updateIds = [];
        for (const commit of payload.commits) {
            const messageLines = commit.message.split('\n');
            const summary = `[${commit.id.substring(0, 7)}] ${messageLines[0]}`;
            const commitBody = messageLines.slice(1).join('\n').trim() || undefined;
            const filesChanged = [
                ...(commit.added || []),
                ...(commit.modified || []),
                ...(commit.removed || [])
            ];
            const priority = getPriorityFromCommit(commit.message);
            const updateId = await createUpdate(tokenResult.userId, project, branch, summary, 'github', 'git', priority, { commitBody, filesChanged: filesChanged.length > 0 ? filesChanged : undefined, commitUrl: commit.url });
            updateIds.push(updateId);
        }
        res.status(200).json({ success: true, message: `Processed ${updateIds.length} commits`, updateIds });
    }
    catch (error) {
        console.error('Error processing GitHub webhook:', error);
        res.status(500).json({ error: 'Internal error processing webhook' });
    }
});
//# sourceMappingURL=index.js.map