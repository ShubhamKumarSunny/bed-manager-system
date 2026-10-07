import React from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

const NotFound = () => (
  <div className="min-h-screen flex items-center justify-center bg-black px-4">
    <div className="text-center max-w-md">
      <Compass className="mx-auto h-12 w-12 text-cyan-400 mb-6" />
      <p className="text-sm font-medium tracking-widest text-neutral-500 uppercase">404</p>
      <h1 className="mt-2 text-3xl font-bold text-white">Page not found</h1>
      <p className="mt-3 text-neutral-400">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex items-center justify-center rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
      >
        Back to home
      </Link>
    </div>
  </div>
);

export default NotFound;
