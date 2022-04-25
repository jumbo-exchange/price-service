import Big from 'big.js';
import { BASE } from './constants';

export function assertFulfilled<T>(
  item: PromiseSettledResult<T>,
): item is PromiseFulfilledResult<T> {
  return item.status === 'fulfilled';
}

export const calculatePriceForToken = (
  firstAmount: string,
  secondAmount: string,
  price: string,
) => {
  if (!price) return '0';
  if (Big(firstAmount).lte(0)) return '0';
  return new Big(firstAmount).mul(price).div(secondAmount).toFixed(5);
};

export const formatTokenAmount = (
  value: string,
  decimals = 18,
  precision?: number,
) =>
  value &&
  Big(value)
    .div(Big(BASE).pow(decimals))
    .toFixed(precision && precision);

export function calculateVolume(
  supplies: { [key: string]: string },
  tokens: { [key: string]: string },
) {
  const suppliesTokens = Object.entries(supplies);

  if (!suppliesTokens.every(([token]) => tokens[token])) return 0;
  return suppliesTokens
    .reduce((acc, [key, value]) => {
      return acc.add(Big(value).mul(tokens[key]));
    }, Big(0))
    .toFixed(0);
}
