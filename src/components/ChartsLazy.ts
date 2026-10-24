import { lazy } from 'react'
// route-level code split: charts sirf insights page pe load honge
export const LazyDonut = lazy(() => import('./Charts').then((m) => ({ default: m.DonutChart })))
export const LazyWeekBars = lazy(() => import('./Charts').then((m) => ({ default: m.WeekBars })))
export const LazyMethodBar = lazy(() => import('./Charts').then((m) => ({ default: m.MethodBar })))
