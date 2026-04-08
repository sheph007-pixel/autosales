export function monthsUntilRenewal(renewalMonth: number): number {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-based
  let diff = renewalMonth - currentMonth;
  if (diff <= 0) diff += 12;
  return diff;
}

export function isRenewalApproaching(renewalMonth: number, thresholdMonths: number = 3): boolean {
  return monthsUntilRenewal(renewalMonth) <= thresholdMonths;
}

export function isRenewalFarAway(renewalMonth: number, thresholdMonths: number = 6): boolean {
  return monthsUntilRenewal(renewalMonth) > thresholdMonths;
}

export function getMonthName(month: number): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return months[month - 1] ?? "Unknown";
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function daysFromNow(days: number): Date {
  return addDays(new Date(), days);
}

export function parseFollowUpTiming(timing: string): Date | null {
  const lower = timing.toLowerCase().trim();
  const now = new Date();

  const monthNames: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  for (const [name, monthIndex] of Object.entries(monthNames)) {
    if (lower.includes(name)) {
      const targetDate = new Date(now.getFullYear(), monthIndex!, 1);
      if (targetDate <= now) {
        targetDate.setFullYear(targetDate.getFullYear() + 1);
      }
      return targetDate;
    }
  }

  const quarterMatch = lower.match(/q([1-4])\s*(\d{4})?/);
  if (quarterMatch) {
    const quarter = parseInt(quarterMatch[1]!);
    const year = quarterMatch[2] ? parseInt(quarterMatch[2]) : now.getFullYear();
    const monthIndex = (quarter - 1) * 3;
    const targetDate = new Date(year, monthIndex, 1);
    if (targetDate <= now) {
      targetDate.setFullYear(targetDate.getFullYear() + 1);
    }
    return targetDate;
  }

  if (lower.includes("next year")) {
    return new Date(now.getFullYear() + 1, 0, 1);
  }

  if (lower.includes("next month")) {
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  const weeksMatch = lower.match(/(\d+)\s*weeks?/);
  if (weeksMatch) {
    return addDays(now, parseInt(weeksMatch[1]!) * 7);
  }

  const daysMatch = lower.match(/(\d+)\s*days?/);
  if (daysMatch) {
    return addDays(now, parseInt(daysMatch[1]!));
  }

  return null;
}
