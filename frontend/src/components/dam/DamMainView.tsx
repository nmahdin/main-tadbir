import React from 'react';
import { DamLibrary } from './DamLibrary';

/** Main DAM view deliberately uses the same backend-backed entry point as projects and tasks. */
export const DamMainView: React.FC = () => <DamLibrary />;
