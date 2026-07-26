'use client';

/**
 * The invite link (Constitution §9.2, §11.3, Rule 14).
 *
 * "Invite links are the only recruitment surface — the invite is the
 * acquisition artifact." Rule 14 asks that every meaningful artifact be
 * linkable and that a stranger opening the link find a way in, so this page
 * exists for exactly one job: take `/clan/join/<code>`, and turn it into a
 * membership.
 *
 * Signed out, it keeps the code and sends the visitor to sign in first — the
 * code is the reason they are here, and losing it on the way to the login
 * screen would waste the one artifact that brought them.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { clanAction } from '@/components/clan/useClanFull';
import { isValidClanInviteCode } from '@/lib/clan/config';
import { NavBar } from '@/components/ui/NavBar';
import { IconShield } from '@/components/ui/icons';

export default function ClanJoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { session, isAuthenticated, isLoading } = useAuth();

  const code = String(params?.code ?? '').trim().toUpperCase();
  const [status, setStatus] = useState<'idle' | 'joining' | 'joined' | 'failed'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const join = useCallback(async () => {
    setStatus('joining');
    const result = await clanAction(session?.access_token, {
      action: 'join_by_code',
      code,
    });
    if (result.ok) {
      setStatus('joined');
      router.replace('/clan');
      return;
    }
    setStatus('failed');
    setMessage(result.error ?? 'That invite did not work');
  }, [code, router, session?.access_token]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) return;
    if (!isValidClanInviteCode(code)) {
      setStatus('failed');
      setMessage('That is not an invite code');
      return;
    }
    if (status === 'idle') void join();
  }, [code, isAuthenticated, isLoading, join, status]);

  return (
    <div className="app-bg text-bone-white">
      <NavBar />
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="panel-elevated p-8 text-center space-y-5 w-full max-w-sm animate-pop-in">
          <IconShield size={34} className="mx-auto text-venom-orange" />
          <h1 className="heading-display text-3xl text-venom-orange">Clan Invite</h1>
          <p className="font-display text-xl tracking-widest text-bone-white">{code}</p>

          {!isAuthenticated ? (
            <>
              <p className="text-beige font-body">Sign in to accept this invite.</p>
              <Link
                href={`/login?next=${encodeURIComponent(`/clan/join/${code}`)}`}
                className="btn-go inline-block px-8 py-3 min-h-[44px]"
              >
                Sign In
              </Link>
            </>
          ) : status === 'joining' ? (
            <p className="text-beige font-body">Joining…</p>
          ) : status === 'failed' ? (
            <>
              <p className="text-strike-red font-body">{message}</p>
              <Link href="/clan" className="btn-neutral inline-block px-8 py-3 min-h-[44px]">
                Go to Clans
              </Link>
            </>
          ) : (
            <p className="text-beige font-body">Welcome to the clan.</p>
          )}
        </div>
      </div>
    </div>
  );
}
