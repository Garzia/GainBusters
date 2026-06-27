import { TranslationDictionary } from '../types.ts';
import { enLocale } from './en.ts';
import { itLocale } from './it.ts';
import { esLocale } from './es.ts';
import { frLocale } from './fr.ts';
import { zhLocale } from './zh.ts';
import { arLocale } from './ar.ts';

export const translations: TranslationDictionary = {
  en: enLocale,
  it: itLocale,
  es: esLocale,
  fr: frLocale,
  zh: zhLocale,
  ar: arLocale
};
