import type { FastifyInstance } from 'fastify';
import { Brain } from '../agents/brain.js';

const brain = new Brain();

export async function streamRoutes(app: FastifyInstance) {
  /**
   * SSE endpoint for streaming full analysis progress.
   * GET /api/stream/full-analysis?appId=xxx
   */
  app.get('/api/stream/full-analysis', async (request, reply) => {
    const { appId, region } = request.query as { appId?: string; region?: string };
    if (!appId) {
      return reply.status(400).send({ error: 'appId is required' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const sendEvent = (data: Record<string, unknown>) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await brain.fullAnalysisStreamed(appId, { region }, (agent, message, progress) => {
        sendEvent({ type: 'status', agent, message, progress });
      });

      sendEvent({
        type: 'result',
        success: true,
        data: result.data,
        tokensUsed: result.tokensUsed,
      });
    } catch (err) {
      sendEvent({
        type: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    reply.raw.end();
  });

  /**
   * SSE endpoint for streaming a single agent run.
   * GET /api/stream/agent/:agent?appId=xxx
   */
  app.get('/api/stream/agent/:agent', async (request, reply) => {
    const { agent } = request.params as { agent: string };
    const { appId, region } = request.query as { appId?: string; region?: string };
    if (!appId) {
      return reply.status(400).send({ error: 'appId is required' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const sendEvent = (data: Record<string, unknown>) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent({ type: 'status', agent, message: `Starting ${agent} agent...`, progress: 0 });

    try {
      const result = await brain.runAgent(agent, appId, { region });
      sendEvent({ type: 'status', agent, message: `${agent} agent complete`, progress: 100 });
      sendEvent({
        type: 'result',
        success: true,
        agent,
        data: result.data,
        actions: result.actions,
        tokensUsed: result.tokensUsed,
      });
    } catch (err) {
      sendEvent({
        type: 'error',
        agent,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    reply.raw.end();
  });
}
