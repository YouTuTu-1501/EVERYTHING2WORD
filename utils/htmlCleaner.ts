/**
 * Sanitizes HTML content produced by OCR / AI conversion.
 * Strips out embedded CSS style blocks, raw CSS rule declarations (.doc-container { ... }),
 * script tags, head/meta tags, and orphan CSS attributes that might be misparsed as text.
 */
export function stripCssAndMetadata(html: string): string {
  if (!html) return '';

  let cleaned = html;

  // 1. Remove markdown code fences if present
  cleaned = cleaned.replace(/```html/gi, '').replace(/```/g, '');

  // 2. Remove entire <style>...</style> blocks (case-insensitive)
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // 3. Remove <script>, <head>, <meta>, <link>, <title> blocks
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  cleaned = cleaned.replace(/<meta[^>]*>/gi, '');
  cleaned = cleaned.replace(/<link[^>]*>/gi, '');
  cleaned = cleaned.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');

  // 4. Remove raw CSS rule blocks like `.doc-container { ... }` or `#id { ... }` or `p { ... }`
  // Handles multi-line or single-line CSS rules with or without leading whitespace
  cleaned = cleaned.replace(/(?:\.|\#|[a-z0-9_\-]+)[\w\-\.\#\s,:]*\{[\s\S]*?\}/gi, (match) => {
    // If the block contains typical CSS properties, remove it completely
    if (/(?:font-family|font-size|line-height|text-align|padding|margin|color|border|background)/i.test(match)) {
      return '';
    }
    return match;
  });

  // 5. Remove any orphan CSS blocks that might not have matched strictly
  cleaned = cleaned.replace(/\.(?:doc-container|doc-p|doc-title|bold|italic|title|container|header|footer)\s*\{[^}]*\}/gi, '');

  // 6. Remove remaining double blank lines or stray leading whitespace from stripping
  cleaned = cleaned.replace(/^\s*[\r\n]/gm, '').trim();

  return cleaned;
}

/**
 * Checks if a text string looks like raw CSS declarations (e.g. `.doc-p { margin: 0; }`).
 */
export function isCssNoiseText(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  // If text starts with class/id/element rule and contains CSS curly braces & properties
  const hasCssBraces = /\{[\s\S]*\}/.test(trimmed);
  const hasCssProps = /(?:font-family|font-size|line-height|text-align|margin-top|margin-bottom|padding|border|color)\s*:/i.test(trimmed);
  const isCssSelector = /^\.(?:doc-|bold|title|container|page|header|footer|style)/i.test(trimmed);

  return (hasCssBraces && hasCssProps) || (isCssSelector && hasCssProps);
}
