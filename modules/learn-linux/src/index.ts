import { activateCourse, type Course } from '@ayalvasis/lessons';
import type { ModuleDefinition } from '@ayalvasis/sdk';
import courseData from './course.json';
import { manifest } from './manifest';

export { manifest } from './manifest';

export const course = courseData as Course;

export const learnLinux: ModuleDefinition = {
  manifest,
  activate: (ctx) => activateCourse(ctx, course),
};

export default learnLinux;
