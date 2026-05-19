import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // 不处理 /api、_next 内部、含点的静态资源
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
