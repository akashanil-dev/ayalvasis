import { CourseView } from '@tuxos/course-view';
import type { AppViewProps } from '@tuxos/system';

export default function LearnDockerView({ system }: AppViewProps) {
  return <CourseView system={system} courseId="learn-docker" />;
}
