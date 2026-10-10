import { CourseView } from '@ayalvasis/course-view';
import type { AppViewProps } from '@ayalvasis/system';

export default function LearnLinuxView({ system }: AppViewProps) {
  return <CourseView system={system} courseId="learn-linux" />;
}
