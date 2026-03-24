import { request } from 'undici';
import { env } from '../config/env.js';

// ─── Types ───

export interface Alert {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  appName?: string;
  agent?: string;
}

// ─── Telegram ───

async function sendTelegram(alert: Alert): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  const emoji =
    alert.severity === 'critical' ? '🔴' :
    alert.severity === 'warning' ? '🟡' : '🔵';

  const text = [
    `${emoji} *${escapeMarkdown(alert.title)}*`,
    '',
    escapeMarkdown(alert.message),
    '',
    alert.appName ? `📱 ${escapeMarkdown(alert.appName)}` : '',
    alert.agent ? `🤖 Agent: ${escapeMarkdown(alert.agent)}` : '',
  ].filter(Boolean).join('\n');

  try {
    const { statusCode } = await request(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
        }),
      },
    );
    return statusCode === 200;
  } catch {
    return false;
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// ─── Discord ───

async function sendDiscord(alert: Alert): Promise<boolean> {
  const webhookUrl = env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return false;

  const color =
    alert.severity === 'critical' ? 0xff0000 :
    alert.severity === 'warning' ? 0xffaa00 : 0x0099ff;

  try {
    const { statusCode } = await request(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: alert.title,
          description: alert.message,
          color,
          fields: [
            ...(alert.appName ? [{ name: 'App', value: alert.appName, inline: true }] : []),
            ...(alert.agent ? [{ name: 'Agent', value: alert.agent, inline: true }] : []),
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'ASOMARK' },
        }],
      }),
    });
    return statusCode === 204 || statusCode === 200;
  } catch {
    return false;
  }
}

// ─── Public API ───

/**
 * Send an alert to all configured notification channels.
 * Returns which channels succeeded.
 */
export async function sendAlert(alert: Alert): Promise<{ telegram: boolean; discord: boolean }> {
  const [telegram, discord] = await Promise.allSettled([
    sendTelegram(alert),
    sendDiscord(alert),
  ]);

  return {
    telegram: telegram.status === 'fulfilled' && telegram.value,
    discord: discord.status === 'fulfilled' && discord.value,
  };
}

/**
 * Send multiple alerts (e.g. from a tracking run).
 */
export async function sendAlerts(alerts: Alert[]): Promise<number> {
  let sent = 0;
  for (const alert of alerts) {
    const result = await sendAlert(alert);
    if (result.telegram || result.discord) sent++;
  }
  return sent;
}

/**
 * Send a daily briefing summary.
 */
export async function sendDailyBriefing(summary: {
  appsTracked: number;
  keywordsTracked: number;
  significantMoves: number;
  competitorChanges: number;
  activeExperiments: number;
  healthScore: number | null;
  topAlerts: string[];
}): Promise<void> {
  const lines = [
    `📊 Daily ASO Briefing`,
    ``,
    `Apps: ${summary.appsTracked} | Keywords: ${summary.keywordsTracked}`,
    `Significant rank moves: ${summary.significantMoves}`,
    `Competitor changes: ${summary.competitorChanges}`,
    `Active experiments: ${summary.activeExperiments}`,
    summary.healthScore !== null ? `Health score: ${summary.healthScore}/100` : '',
    ``,
    ...summary.topAlerts.slice(0, 5).map((a) => `• ${a}`),
  ].filter(Boolean);

  await sendAlert({
    title: 'Daily ASO Briefing',
    message: lines.join('\n'),
    severity: summary.significantMoves > 0 ? 'warning' : 'info',
  });
}
