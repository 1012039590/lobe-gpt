import { notFound } from 'next/navigation';

import ServerLayout from '@/components/server/ServerLayout';
import { serverFeatureFlags } from '@/config/featureFlags';

import Desktop from './_layout/Desktop';
import Mobile from './_layout/Mobile';
import { LayoutProps } from './_layout/type';

const Layout = ServerLayout<LayoutProps>({ Desktop, Mobile });

Layout.displayName = 'FileLayout';

export default (props: LayoutProps) => {
  const enableKnowledgeBase = serverFeatureFlags().enableKnowledgeBase;

  if (!enableKnowledgeBase) return notFound();

  return <Layout {...props} />;
};
