'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy teacher page - redirects to the main course management page.
 */
export default function TeacherDashboardPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/teacher/courses'); }, [router]);
  return null;
}
