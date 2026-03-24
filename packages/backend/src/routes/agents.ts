import type { FastifyInstance } from 'fastify';
import { Brain, type AgentName } from '../agents/index.js';

const brain = new Brain();

export async function agentRoutes(app: FastifyInstance) {
  // Run a specific agent on an app
  app.post('/api/agents/:agent/run', async (request, reply) => {
    const { agent } = request.params as { agent: string };
    const { appId } = request.body as { appId: string };

    const validAgents: AgentName[] = ['recon', 'keyword', 'review', 'creative', 'health', 'correlation', 'risk', 'tracker', 'experiment'];
    if (!validAgents.includes(agent as AgentName)) {
      return reply.code(400).send({ error: `Invalid agent: ${agent}. Valid: ${validAgents.join(', ')}` });
    }
    if (!appId) {
      return reply.code(400).send({ error: 'appId is required' });
    }

    try {
      const result = await brain.runAgent(agent as AgentName, appId);
      return { agent, appId, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent execution failed';
      return reply.code(500).send({ error: message });
    }
  });

  // Run full analysis pipeline on an app
  app.post('/api/agents/full-analysis', async (request, reply) => {
    const { appId } = request.body as { appId: string };
    if (!appId) {
      return reply.code(400).send({ error: 'appId is required' });
    }

    try {
      const result = await brain.fullAnalysis(appId);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Full analysis failed';
      return reply.code(500).send({ error: message });
    }
  });

  // Get pending strategy actions
  app.get('/api/agents/pending', async (request) => {
    const { appId } = request.query as { appId?: string };
    const rows = await brain.getPendingActions(appId);
    return { data: rows, meta: { total: rows.length } };
  });

  // Approve a strategy action
  app.post('/api/agents/actions/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await brain.approveAction(id);
    if (!row) return reply.code(404).send({ error: 'Action not found' });
    return row;
  });

  // Reject a strategy action
  app.post('/api/agents/actions/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await brain.rejectAction(id);
    if (!row) return reply.code(404).send({ error: 'Action not found' });
    return row;
  });
}
