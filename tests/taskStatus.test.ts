/**
 * 任务状态定义 — 单元测试
 */

import {
	DEFAULT_TASK_STATUSES,
	PRESET_CUSTOM_STATUSES,
	ALL_BUILTIN_STATUSES,
	STATUS_SYMBOL_EXCLUDED,
	RESERVED_SYMBOLS,
	MACARON_COLORS,
	getStatusBySymbol,
	getStatusByKey,
	validateStatusSymbol,
	getStatusColor,
	parseStatusFromCheckbox,
	isDefaultStatus,
	getDefaultStatusKeys,
} from '../src/tasks/taskStatus';
import type { TaskStatus } from '../src/tasks/taskStatus';

describe('任务状态', () => {
	describe('DEFAULT_TASK_STATUSES', () => {
		it('TS-01: 包含 5 个纯颜色状态（待办/已完成已移除）', () => {
			expect(DEFAULT_TASK_STATUSES).toHaveLength(5);
		});

		it('TS-02: 每种状态都有必要的字段', () => {
			DEFAULT_TASK_STATUSES.forEach(status => {
				expect(status.key).toBeTruthy();
				expect(status.symbol).toBeDefined();
				expect(status.name).toBeTruthy();
				expect(status.lightColors).toBeDefined();
				expect(status.darkColors).toBeDefined();
				// 状态已统一为纯颜色标签：不再有"不可删除"的默认状态
				expect(status.isDefault).toBe(false);
			});
		});

		it('TS-03: 包含所有预期状态（不含 todo/done）', () => {
			const keys = DEFAULT_TASK_STATUSES.map(s => s.key);
			expect(keys).toEqual(['important', 'canceled', 'in_progress', 'question', 'start']);
			expect(keys).not.toContain('todo');
			expect(keys).not.toContain('done');
		});

		it('TS-04: 符号映射正确', () => {
			const symbolMap: Record<string, string> = {
				'!': 'important', '-': 'canceled', '/': 'in_progress', '?': 'question', n: 'start',
			};
			DEFAULT_TASK_STATUSES.forEach(status => {
				expect(symbolMap[status.symbol]).toBe(status.key);
			});
		});
	});

	describe('PRESET_CUSTOM_STATUSES', () => {
		it('TS-01b: 包含 5 种预设自定义状态', () => {
			expect(PRESET_CUSTOM_STATUSES).toHaveLength(5);
		});

		it('TS-02b: 预设状态 isDefault 为 false', () => {
			PRESET_CUSTOM_STATUSES.forEach(status => {
				expect(status.isDefault).toBe(false);
			});
		});

		it('TS-03b: 包含预期的预设状态', () => {
			const keys = PRESET_CUSTOM_STATUSES.map(s => s.key);
			expect(keys).toEqual(['important', 'canceled', 'in_progress', 'question', 'start']);
		});
	});

	describe('ALL_BUILTIN_STATUSES', () => {
		it('TS-01c: 包含全部 5 种内置状态', () => {
			expect(ALL_BUILTIN_STATUSES).toHaveLength(5);
		});

		it('TS-02c: 符号映射正确', () => {
			const symbolMap: Record<string, string> = {
				'!': 'important', '-': 'canceled',
				'/': 'in_progress', '?': 'question', 'n': 'start',
			};
			ALL_BUILTIN_STATUSES.forEach(status => {
				expect(symbolMap[status.symbol]).toBe(status.key);
			});
		});
	});

	describe('getStatusBySymbol', () => {
		it('TS-05: 查找存在的符号', () => {
			expect(getStatusBySymbol('!')!.key).toBe('important');
			expect(getStatusBySymbol('/')!.key).toBe('in_progress');
			expect(getStatusBySymbol('-')!.key).toBe('canceled');
			expect(getStatusBySymbol('?')!.key).toBe('question');
			expect(getStatusBySymbol('n')!.key).toBe('start');
		});

		it('TS-06: 不存在的符号返回 undefined', () => {
			expect(getStatusBySymbol('z')).toBeUndefined();
			expect(getStatusBySymbol('')).toBeUndefined();
		});
	});

	describe('getStatusByKey', () => {
		it('TS-07: 查找存在的 key', () => {
			expect(getStatusByKey('important')!.symbol).toBe('!');
			expect(getStatusByKey('in_progress')!.symbol).toBe('/');
		});

		it('TS-08: 不存在的 key 返回 undefined', () => {
			expect(getStatusByKey('unknown')).toBeUndefined();
		});
	});

	describe('validateStatusSymbol', () => {
		it('TS-09: 有效字母符号', () => {
			expect(validateStatusSymbol('a').valid).toBe(true);
			expect(validateStatusSymbol('Z').valid).toBe(true);
		});

		it('TS-09b: 有效标点符号', () => {
			expect(validateStatusSymbol('!').valid).toBe(true);
			expect(validateStatusSymbol('-').valid).toBe(true);
			expect(validateStatusSymbol('/').valid).toBe(true);
			expect(validateStatusSymbol('?').valid).toBe(true);
			expect(validateStatusSymbol('@').valid).toBe(true);
		});

		it('TS-10: 有效数字符号', () => {
			expect(validateStatusSymbol('1').valid).toBe(true);
		});

		it('TS-11: 保留符号不允许自定义', () => {
			RESERVED_SYMBOLS.forEach(symbol => {
				expect(validateStatusSymbol(symbol).valid).toBe(false);
			});
		});

		it('TS-12: 非自定义时保留符号可通过验证', () => {
			expect(validateStatusSymbol('x', false).valid).toBe(true);
			// 空格不是 \S，即使 isCustom=false 也无效
			expect(validateStatusSymbol(' ', false).valid).toBe(false);
		});

		it('TS-12b: 非自定义时各种符号均可通过验证', () => {
			expect(validateStatusSymbol('!', false).valid).toBe(true);
			expect(validateStatusSymbol('n', false).valid).toBe(true);
		});

		it('TS-13: 禁止的符号列表', () => {
			STATUS_SYMBOL_EXCLUDED.forEach(symbol => {
				expect(validateStatusSymbol(symbol).valid).toBe(false);
			});
		});

		it('TS-14: 多字符符号无效', () => {
			expect(validateStatusSymbol('ab').valid).toBe(false);
		});

		it('TS-15: 空字符串无效', () => {
			expect(validateStatusSymbol('').valid).toBe(false);
		});
	});

	describe('getStatusColor', () => {
		it('TS-16: light 模式返回 lightColors', () => {
			const color = getStatusColor('important', ALL_BUILTIN_STATUSES, 'light');
			expect(color).toBeDefined();
			expect(color!.bg).toBe('#ff4d4f');
			expect(color!.text).toBe('#FFFFFF');
		});

		it('TS-17: dark 模式返回 darkColors', () => {
			const color = getStatusColor('important', ALL_BUILTIN_STATUSES, 'dark');
			expect(color).toBeDefined();
			expect(color!.bg).toBe('#cc3a3c');
		});

		it('TS-17b: 已取消为绿色（沿用原「已完成」色，不再是灰）', () => {
			const light = getStatusColor('canceled', ALL_BUILTIN_STATUSES, 'light');
			expect(light!.bg).toBe('#52c41a');
			expect(light!.text).toBe('#FFFFFF');
			const dark = getStatusColor('canceled', ALL_BUILTIN_STATUSES, 'dark');
			expect(dark!.bg).toBe('#3c8524');
			expect(dark!.text).toBe('#e6e6e6');
			// 确认不再是旧的灰色
			expect(light!.bg).not.toBe('#d9d9d9');
		});

		it('TS-18a: 不存在的 key 返回 undefined', () => {
			expect(getStatusColor('unknown', ALL_BUILTIN_STATUSES, 'light')).toBeUndefined();
		});

		it('TS-18: 旧格式兼容（lightColors/darkColors 优先）', () => {
			const legacyStatuses: TaskStatus[] = [{
				key: 'custom',
				symbol: 'c',
				name: '自定义',
				description: '自定义状态',
				backgroundColor: '#ff0000',
				textColor: '#ffffff',
				lightColors: { backgroundColor: '', textColor: '' },
				darkColors: { backgroundColor: '', textColor: '' },
				isDefault: false,
			}];
			const color = getStatusColor('custom', legacyStatuses, 'light');
			expect(color!.bg).toBe('#FFFFFF');
			expect(color!.text).toBe('#333333');
		});
	});

	describe('parseStatusFromCheckbox', () => {
		it('TS-19: x 已无映射 → 空串', () => expect(parseStatusFromCheckbox('x')).toBe(''));
		it('TS-20: 空格 = 无状态 → 空串', () => expect(parseStatusFromCheckbox(' ')).toBe(''));
		it('TS-21: / → in_progress', () => expect(parseStatusFromCheckbox('/')).toBe('in_progress'));
		it('TS-22: - → canceled', () => expect(parseStatusFromCheckbox('-')).toBe('canceled'));
		it('TS-23: ! → important', () => expect(parseStatusFromCheckbox('!')).toBe('important'));
		it('TS-24: ? → question', () => expect(parseStatusFromCheckbox('?')).toBe('question'));
		it('TS-25: n → start', () => expect(parseStatusFromCheckbox('n')).toBe('start'));
		it('TS-26: 未知符号 → 空串', () => expect(parseStatusFromCheckbox('z')).toBe(''));
	});

	describe('isDefaultStatus', () => {
		it('TS-27: 默认列表内的状态返回 true', () => {
			expect(isDefaultStatus('important')).toBe(true);
			expect(isDefaultStatus('in_progress')).toBe(true);
		});

		it('TS-27b: 已移除的 todo/done 返回 false', () => {
			expect(isDefaultStatus('todo')).toBe(false);
			expect(isDefaultStatus('done')).toBe(false);
		});

		it('TS-28: 自定义状态返回 false', () => {
			expect(isDefaultStatus('custom')).toBe(false);
		});
	});

	describe('getDefaultStatusKeys', () => {
		it('TS-29: 返回 5 个默认 key', () => {
			const keys = getDefaultStatusKeys();
			expect(keys).toHaveLength(5);
			expect(keys).toEqual(['important', 'canceled', 'in_progress', 'question', 'start']);
		});
	});

	describe('MACARON_COLORS', () => {
		it('TS-30: 非空颜色数组', () => {
			expect(MACARON_COLORS.length).toBeGreaterThan(0);
			MACARON_COLORS.forEach(c => {
				expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
			});
		});
	});
});
