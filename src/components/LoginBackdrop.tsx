import React from 'react';

const LoginBackdrop: React.FC = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <img
        src="/login-bg.jpg"
        alt=""
        className="login-backdrop-image login-backdrop-image-mobile absolute inset-0 w-full h-full object-cover"
      />
      <img
        src="/login-bg-desktop.jpg"
        alt=""
        className="login-backdrop-image login-backdrop-image-desktop absolute inset-0 w-full h-full object-cover"
        onError={(event) => {
          // Keep the current login image visible until the desktop asset is provided.
          event.currentTarget.src = '/login-bg.jpg';
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.60) 40%, rgba(0,0,0,0.80) 100%)',
        }}
      />
    </div>
  );
};

export default LoginBackdrop;
