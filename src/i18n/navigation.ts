// 类型安全的 Link / redirect / usePathname / useRouter,自动带 locale 前缀。
import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
