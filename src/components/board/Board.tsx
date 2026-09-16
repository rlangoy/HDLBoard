import type { HTMLAttributes, ReactNode } from 'react';
import { cx, scaleStyle } from './Panel';
import './tokens.css';
import './Board.css';

export interface BoardProps extends HTMLAttributes<HTMLElement> {
  /**
   * The four panels, in reading order. `Component_grouping.png` puts
   * them LEDs, 7-segment, switches, pushbuttons — outputs on top,
   * inputs underneath.
   */
  children: ReactNode;
  /** Board scale unit (the switch housing width). Default `34`. */
  size?: number | string;
}

/**
 * The 2×2 board layout from `DesignResources/Component_grouping.png`.
 *
 * Purely an arrangement: it holds no state and knows nothing about the
 * panels inside it, so any subset works — three panels, or two, or a
 * different order.
 */
export function Board({ children, size, className, style, ...rest }: BoardProps) {
  return (
    <div
      {...rest}
      className={cx('pb-ui', 'pb-board', className)}
      style={scaleStyle(size, style)}
    >
      {children}
    </div>
  );
}

export default Board;
