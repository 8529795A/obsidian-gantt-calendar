import { CalendarDay, CalendarWeek } from '../types';
import { solarToLunar, getShortLunarText } from '../lunar/lunar';
import { isToday } from './dateCompare';
import { getTodayInTimezone } from './timezone';

/**
 * Get start of week for a given date
 */
export function startOfWeek(date: Date, startOnMonday: boolean = true): Date {
	const d = new Date(date);
	const day = d.getDay(); // 0=Sun
	let diff = 0;
	if (startOnMonday) {
		diff = day === 0 ? -6 : 1 - day; // Monday as start
	} else {
		diff = -day; // Sunday as start
	}
	d.setDate(d.getDate() + diff);
	d.setHours(0, 0, 0, 0);
	return d;
}

/**
 * Calculate week number
 * Week 1 is the week that contains Jan 1 of the given base year,
 * even if that week starts in the previous year.
 */
export function getWeekNumber(date: Date, baseYear?: number, startOnMonday: boolean = true): number {
	const year = baseYear ?? date.getFullYear();
	const firstWeekStart = startOfWeek(new Date(year, 0, 1), startOnMonday);
	const weekStart = startOfWeek(date, startOnMonday);

	const diff = weekStart.getTime() - firstWeekStart.getTime();
	const weekIndex = Math.floor(diff / (7 * 24 * 60 * 60 * 1000));

	return weekIndex < 0 ? 1 : weekIndex + 1;
}

/**
 * Check if date is in current week
 */
export function isThisWeek(date: Date, startOnMonday: boolean = true): boolean {
	const today = getTodayInTimezone();
	const weekStart = startOfWeek(today, startOnMonday);
	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekEnd.getDate() + 7);

	const targetDate = new Date(date);
	targetDate.setHours(0, 0, 0, 0);

	return targetDate >= weekStart && targetDate < weekEnd;
}

/**
 * 从任意起点构建连续 7 天窗口（**不吸附到周首日**）。
 *
 * 与 getWeekOfDate 的区别：后者总是把 date 吸附到 startOfWeek，导致
 * 「currentDate + 2 天」在未跨周边界时仍显示同一周（位移被 startOfWeek 抹平）。
 * 周视图的滚动窗口（每次 ±2 天）必须用本函数，才能让窗口起点落在任意一天。
 *
 * weekNumber 取窗口起点所在周的周号，仅作参考——滚动窗口可能横跨两周，
 * 调用方应优先展示日期区间而非周号。
 */
export function getWeekFromStart(startDate: Date, startOnMonday: boolean = true): CalendarWeek {
	const base = new Date(startDate);
	base.setHours(0, 0, 0, 0);

	const days: CalendarDay[] = [];
	for (let i = 0; i < 7; i++) {
		const currentDate = new Date(base);
		currentDate.setDate(base.getDate() + i);
		const lunarInfo = solarToLunar(currentDate);
		days.push({
			date: currentDate,
			day: currentDate.getDate(),
			isCurrentMonth: true,
			isToday: isToday(currentDate),
			weekday: currentDate.getDay(),
			lunarText: getShortLunarText(currentDate),
			festival: lunarInfo.festival,
		});
	}

	return {
		weekNumber: getWeekNumber(base, base.getFullYear(), startOnMonday),
		days,
		startDate: base,
		endDate: new Date(base.getTime() + 6 * 24 * 60 * 60 * 1000),
	};
}

/**
 * Get week data for a specific date
 */
export function getWeekOfDate(date: Date, baseYear?: number, startOnMonday: boolean = true): CalendarWeek {
	const startDate = startOfWeek(date, startOnMonday);

	const days: CalendarDay[] = [];
	for (let i = 0; i < 7; i++) {
		const currentDate = new Date(startDate);
		currentDate.setDate(startDate.getDate() + i);
		const lunarInfo = solarToLunar(currentDate);
		days.push({
			date: currentDate,
			day: currentDate.getDate(),
			isCurrentMonth: true,
			isToday: isToday(currentDate),
			weekday: currentDate.getDay(),
			lunarText: getShortLunarText(currentDate),
			festival: lunarInfo.festival,
		});
	}

	return {
		weekNumber: getWeekNumber(startDate, baseYear ?? date.getFullYear(), startOnMonday),
		days,
		startDate,
		endDate: new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000),
	};
}
