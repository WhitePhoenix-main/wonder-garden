import type { GameState } from './model'
import { autoSellOffer } from './config'
import { saleValue } from './queries'

export function sellBasket(state: GameState): string[] {
  if (!state.basket.length) return []
  state.coins += saleValue(state)
  state.basket = []
  state.sold = true
  if (state.autoSell) state.sellRemaining = autoSellOffer.intervalSec
  return ['Sold']
}
