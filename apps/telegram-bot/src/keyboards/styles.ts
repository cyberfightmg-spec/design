import { InlineKeyboard } from 'grammy';
import { getAllStyles, STYLE_CATEGORIES, type InteriorStyle } from '@interior/styles';
import type { StyleCategory } from '@interior/styles';

export function buildStyleKeyboard(selectedIds: string[]): InlineKeyboard {
  const styles = getAllStyles();
  const keyboard = new InlineKeyboard();

  const categories: StyleCategory[] = ['classic', 'modern', 'ethnic', 'retro', 'natural'];

  for (const category of categories) {
    const categoryStyles = styles.filter(s => s.category === category);
    if (categoryStyles.length === 0) continue;

    // Category header (non-clickable label)
    keyboard.text(`── ${STYLE_CATEGORIES[category]} ──`, `noop:${category}`).row();

    // Styles in this category (2 per row)
    for (let i = 0; i < categoryStyles.length; i += 2) {
      const style1 = categoryStyles[i];
      const style2 = categoryStyles[i + 1];

      if (style1) {
        const isSelected = selectedIds.includes(style1.id);
        keyboard.text(
          `${isSelected ? '✅' : '⬜'} ${style1.displayName}`,
          `style:toggle:${style1.id}`
        );
      }
      if (style2) {
        const isSelected = selectedIds.includes(style2.id);
        keyboard.text(
          `${isSelected ? '✅' : '⬜'} ${style2.displayName}`,
          `style:toggle:${style2.id}`
        );
      }
      keyboard.row();
    }
  }

  // Action buttons
  keyboard.row();
  keyboard.text('☑️ Выбрать все', 'style:select_all');
  keyboard.text('✖️ Сбросить', 'style:clear');
  keyboard.row();

  const count = selectedIds.length;
  const label = count > 0 ? `▶️ Создать выбранные (${count})` : '▶️ Создать выбранные';
  keyboard.text(label, 'style:generate');

  return keyboard;
}
