// The Repeat menu used by calendar events and tasks: quick choices, plus
// "Custom…" for things like "every 2 weeks on Mon, Wed" or "every 3 days".

import { h } from './ui.js';
import { RULES, UNITS, WEEKDAYS, parseRule, formatRule, describeRule } from './calendar/repeat.js';

const CUSTOM = '__custom';

// rule: current rule text or null. from: the date it counts from ('YYYY-MM-DD').
// onChange(ruleText | null) is called once the choice is made.
export function repeatPicker({ rule, from, onChange, className = '' }) {
  const menu = h('select', { class: className, 'aria-label': 'Repeat' },
    h('option', { value: '' }, 'Does not repeat'),
    RULES.map((r) => h('option', { value: r }, describeRule(r, from))),
    rule && !RULES.includes(rule) ? h('option', { value: rule }, describeRule(rule, from)) : null,
    h('option', { value: CUSTOM }, 'Custom…'));
  menu.value = rule || '';

  const custom = h('div', { class: 'repeat-custom', hidden: true });
  const wrap = h('div', { class: 'repeat-picker' }, menu, custom);

  menu.addEventListener('change', () => {
    if (menu.value === CUSTOM) {
      showCustom();
      return;
    }
    custom.hidden = true;
    onChange(menu.value || null);
  });

  function showCustom() {
    const start = parseRule(rule) || { every: 1, unit: 'week', days: [] };
    const fromDay = from ? new Date(`${from}T12:00`).getDay() : 1;
    const days = new Set(start.days.length ? start.days : [fromDay]);
    const every = h('input', { type: 'number', min: '1', max: '99', value: String(start.every), class: 'repeat-every', 'aria-label': 'Repeat every' });
    const unit = h('select', { class: 'repeat-unit', 'aria-label': 'Unit' },
      UNITS.map((u) => h('option', { value: u }, `${u}s`)));
    unit.value = start.weekday ? 'week' : start.unit;
    const dayRow = h('div', { class: 'repeat-days', role: 'group', 'aria-label': 'On these days' });
    const drawDays = () => {
      dayRow.hidden = unit.value !== 'week';
      dayRow.replaceChildren(...[1, 2, 3, 4, 5, 6, 0].map((d) => h('button', {
        type: 'button',
        class: `repeat-day${days.has(d) ? ' is-on' : ''}`,
        'aria-pressed': String(days.has(d)),
        'aria-label': WEEKDAYS[d],
        title: WEEKDAYS[d],
        onclick: () => {
          if (days.has(d) && days.size > 1) days.delete(d);
          else days.add(d);
          drawDays();
        },
      }, WEEKDAYS[d][0])));
    };
    unit.addEventListener('change', drawDays);
    drawDays();
    const done = h('button', {
      type: 'button',
      class: 'repeat-done',
      onclick: () => {
        const n = Math.max(1, Math.min(99, Number(every.value) || 1));
        // One day that's the start day's own weekday is just "every week".
        const picked = [...days];
        const onlyStartDay = picked.length === 1 && picked[0] === fromDay;
        onChange(formatRule({ every: n, unit: unit.value, days: unit.value === 'week' && !onlyStartDay ? picked : [] }));
      },
    }, 'Set');
    custom.replaceChildren(
      h('div', { class: 'repeat-row' }, h('span', null, 'Every'), every, unit, done),
      dayRow);
    custom.hidden = false;
    every.focus();
  }

  return wrap;
}
