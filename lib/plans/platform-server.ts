import { getSessionUser } from '@/lib/security/guard';
import { isPlatformOperator } from './platform-policy';

export async function platformOperator() {
  const user = await getSessionUser();
  return user && isPlatformOperator(user.id, process.env.DUKAANOS_PLATFORM_ADMIN_IDS ?? '') ? user : null;
}
