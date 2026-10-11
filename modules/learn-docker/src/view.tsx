import { LearningLabView } from '@tuxos/course-view';
import type { AppViewProps } from '@tuxos/system';

export default function LearnDockerView({ system }: AppViewProps) {
  return <LearningLabView system={system} courseId="learn-docker" variant="docker" />;
}
