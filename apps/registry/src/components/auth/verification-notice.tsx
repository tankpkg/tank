interface VerificationNoticeProps {
  email: string;
  onRetry: () => void;
}

export function VerificationNotice({ email, onRetry }: VerificationNoticeProps) {
  return (
    <div className="text-center space-y-3 py-4">
      <div className="text-4xl">📧</div>
      <h3 className="text-lg font-semibold">Check your email</h3>
      <p className="text-sm text-muted-foreground">
        We sent a verification link to <strong>{email}</strong>. Click the link to activate your account.
      </p>
      <p className="text-xs text-muted-foreground">
        Didn&apos;t get it? Check your spam folder or{' '}
        <button type="button" className="underline hover:text-foreground" onClick={onRetry}>
          try again
        </button>
        .
      </p>
    </div>
  );
}
