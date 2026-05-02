import React from 'react';

const LoginBackdrop: React.FC = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <img
        src="/login-bg.jpg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
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
