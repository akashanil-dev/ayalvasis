import { LearningLabView } from '@tuxos/course-view';
import type { AppViewProps } from '@tuxos/system';

export default function LearnLinuxView({ system }: AppViewProps) {
  return <LearningLabView system={system} courseId="learn-linux" variant="linux" />;
}
