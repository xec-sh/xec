Многие рендереры в обычном режиме (inline) рендерят следующим образом, например bubbletea:
1. **State tracking**: Keep track of `linesRendered` - how many lines were rendered in the last frame
2. **Cursor positioning**: Before rendering, move cursor up to the start of the previously rendered area using `CursorUp(linesRendered - 1)`
3. **Line-by-line rendering**: Render each line with `EraseLineRight` to clear any leftover content from the previous frame
4. **Clear remaining space**: If the new content has fewer lines than the previous frame, use `EraseScreenBelow` to clear leftover lines
5. **Final cursor position**: Move cursor to the start of the last line for consistent behavior.



Проблема в функции `write_move_to_inline`: при каждом позиционировании используется `\x1b[u` (restore cursor position), которая восстанавливает не только позицию курсора, но и все сохранённые атрибуты (цвета, стили).

Текущий подход:

При первом рендере: `\x1b[s` сохраняет позицию и атрибуты
При каждом позиционировании: `\x1b[u` восстанавливает всё (включая цвета)
Это сбрасывает установленные цвета
Улучшенное решение

Вместо save/restore можно использовать отслеживание позиции курсора программно. 

Также, надо учитыватьскроллинг, когда пользователь в обычном режиме, но у терминала есть итосрия по скрроллу и ели перематывать скроллинг во время рендеринга, то это тоже надо учитывать и корректировать начальную позицию. И в частности если пользователь отскролит назад и начальная позиция курсора (откуда нужно начинать рендеринг) выйдет за область видимости, то рендерить не нужно. В общем все эти и другие ньюансы нужно учитывать.