import Big from 'big.js';
import { BASE, TO_FIXED_0_PRECISION, TO_FIXED_5_PRECISION } from './constants';

export const calculatePriceForToken = (
  firstAmount: string,
  secondAmount: string,
  price: string,
) => {
  if (!price) return '0';
  if (Big(firstAmount).lte(0)) return '0';
  return new Big(firstAmount)
    .mul(price)
    .div(secondAmount)
    .toFixed(TO_FIXED_5_PRECISION);
};

export const formatTokenAmount = (
  value: string,
  decimals = 18,
  precision?: number,
) => value && Big(value).div(Big(BASE).pow(decimals)).toFixed(precision);

export function calculateVolume(
  supplies: { [key: string]: string },
  tokens: { [key: string]: string },
): string {
  const suppliesTokens = Object.entries(supplies);

  if (!suppliesTokens.every(([token]) => tokens[token])) return '0';
  return suppliesTokens
    .reduce((acc, [key, value]) => {
      return acc.add(Big(value).mul(tokens[key]));
    }, Big(0))
    .toFixed(TO_FIXED_0_PRECISION);
}
