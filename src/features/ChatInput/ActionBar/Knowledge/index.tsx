import { ActionIcon } from '@lobehub/ui';
import { LibraryBig, LucideLoader2 } from 'lucide-react';
import { Suspense, memo } from 'react';
import { useTranslation } from 'react-i18next';

import TipGuide from '@/components/TipGuide';
import { useUserStore } from '@/store/user';
import { preferenceSelectors } from '@/store/user/selectors';

import DropdownMenu from './Dropdown';

const Knowledge = memo(() => {
  const { t } = useTranslation('chat');

  const [showTip, updateGuideState] = useUserStore((s) => [
    preferenceSelectors.showUploadFileInKnowledgeBaseTip(s),
    s.updateGuideState,
  ]);

  const content = (
    <DropdownMenu>
      <ActionIcon icon={LibraryBig} placement={'bottom'} title={t('knowledgeBase.title')} />
    </DropdownMenu>
  );

  return (
    <Suspense fallback={<ActionIcon icon={LucideLoader2} spin />}>
      {showTip ? (
        <TipGuide
          onOpenChange={() => {
            updateGuideState({ uploadFileInKnowledgeBase: false });
          }}
          open={showTip}
          placement={'top'}
          title={t('knowledgeBase.uploadGuide')}
        >
          {content}
        </TipGuide>
      ) : (
        content
      )}
    </Suspense>
  );
});

export default Knowledge;
