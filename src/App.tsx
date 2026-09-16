import { useEffect, useState } from 'react';
import { Workbench } from './components/workbench';
import ComponentGallery from './ComponentGallery';

/**
 * Entry point. The workbench (DesignResources/WorkBench.png) is the
 * main page; the per-component gallery used by the Design_Description.md
 * § 7 visual-verification workflow stays reachable at the `#gallery`
 * hash rather than being deleted.
 */
export default function App() {
  const [showGallery, setShowGallery] = useState(() => window.location.hash === '#gallery');

  useEffect(() => {
    const onHashChange = () => setShowGallery(window.location.hash === '#gallery');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return showGallery ? <ComponentGallery /> : <Workbench />;
}
