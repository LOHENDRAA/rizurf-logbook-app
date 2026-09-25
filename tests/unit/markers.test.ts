import { describe, expect, it } from 'vitest';
import { findMarkers } from '../../src/core/detect/markers';
import { defaultMarkerBinding, isPlaceholderOrBlank, matchCoverKey, WEEK_RE } from '../../src/core/detect/labels';

describe('findMarkers', () => {
  it('finds bracket markers with their inner text as label', () => {
    const hits = findMarkers('Name: {{ student_name }} ID [Matric No] on <insert date>');
    expect(hits.map(h => [h.label, h.kind])).toEqual([['student_name', 'bracket'], ['Matric No', 'bracket'], ['insert date', 'bracket']]);
    expect('Name: {{ student_name }}'.slice(hits[0].start, hits[0].end)).toBe('{{ student_name }}');
  });
  it('labels blank lines with the text before them', () => {
    const hits = findMarkers('Name: ________  Date: ..........');
    expect(hits.map(h => h.label)).toEqual(['Name', 'Date']);
    expect(hits.every(h => h.kind === 'line')).toBe(true);
  });
  it('ignores empty checkboxes, short ellipses and normal prose', () => {
    expect(findMarkers('Tick [ ] if done... then continue')).toEqual([]);
  });
  it('treats a unicode ellipsis run as a blank', () => {
    expect(findMarkers('Remarks: ……')).toHaveLength(1);
  });
});

describe('label patterns', () => {
  it('recognises cover labels and blanks', () => {
    expect(matchCoverKey("Student's Name")).toBe('studentName');
    expect(matchCoverKey('Hobbies')).toBeNull();
    expect(isPlaceholderOrBlank('  ')).toBe(true);
    expect(isPlaceholderOrBlank('<date>')).toBe(true);
    expect(isPlaceholderOrBlank('______')).toBe(true);
    expect(isPlaceholderOrBlank('Monday')).toBe(false);
  });
  it('matches week and month rows but not "weekly"', () => {
    expect(WEEK_RE.test('Week 3')).toBe(true);
    expect(WEEK_RE.test('Month:')).toBe(true);
    expect(WEEK_RE.test('Weekly report')).toBe(false);
  });
  it('picks default bindings for markers', () => {
    expect(defaultMarkerBinding('Supervisor signature')).toBe('signature');
    expect(defaultMarkerBinding('insert date')).toBe('date');
    expect(defaultMarkerBinding('Name')).toBe('free');
  });
});
