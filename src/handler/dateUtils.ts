export const parseDate = (expression: string): Date | null => {
  const trimmed = expression.trim();
  if (trimmed.toLowerCase().startsWith('now')) {
    try {
      // Evaluate 'now' with offset like 'now+3600'
      // Security note: eval is used in original code, but here we just need to handle the time offset logic.
      // Original code: eval(`${(new Date()).getTime()}${expression.substring(3)}`)
      // We can preserve this logic or try to make it safer if possible, but for consistency let's stick to the logic 
      // but maybe strict parsing if possible. 
      // Actually, 'now' handling in original code allows arbitrary math like 'now+1000'.
      // Let's implement logic to handle 'now' base.

      const nowTime = new Date().getTime();
      const offsetExpression = trimmed.substring(3).trim();

      if (!offsetExpression) {
        return new Date(nowTime);
      }

      // If use eval, we must be careful. 
      // The original code uses eval. 
      // Let's replicate original behavior for now as it seems to be a feature.
      const resultTime = (0, eval)(`${nowTime}${offsetExpression}`);
      return new Date(Number(resultTime));

    } catch (_e) {
      return null;
    }
  }

  try {
    // Try parsing as number (timestamp)
    // Check if it looks like a number
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      let timestamp = Number(trimmed);
      // Automatic detection of seconds vs milliseconds
      // 30000000000 is roughly year 2920, so below that is likely seconds if we assume recent dates
      // But 30000000000 ms is roughly year 1970 + 1 year.
      // Wait, 30,000,000,000 is 3e10. 
      // 1970 is 0.
      // 2023 is ~1.7e12 (ms) or ~1.7e9 (sec).
      // The original code uses 30000000000 (3e10) as threshold.
      // If <= 3e10, treat as seconds. 3e10 sec is year 2920. 
      // So if it's small number, it's seconds.
      if (Math.abs(timestamp) <= 30000000000) {
        timestamp = timestamp * 1000;
      }
      return new Date(timestamp);
    }

    // Try parsing as date string
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date;
    }
  } catch (_e) {
    return null;
  }

  return null;
};
