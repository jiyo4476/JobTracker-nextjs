'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  useCreateUserSkill,
  useDeleteUserSkill,
  useSkills,
  useUserSkills,
} from '@/lib/queries'

export function SkillGapSettings() {
  const { data: skills = [], isLoading: skillsLoading, isError: skillsError } = useSkills()
  const { data: userSkills = [], isLoading: userSkillsLoading, isError: userSkillsError } = useUserSkills()
  const createUserSkill = useCreateUserSkill()
  const deleteUserSkill = useDeleteUserSkill()
  const [skillInput, setSkillInput] = useState('')

  const userSkillIds = useMemo(
    () => new Set(userSkills.map(skill => skill.skillId)),
    [userSkills]
  )

  const skillGaps = useMemo(
    () =>
      skills
        .filter(skill => !userSkillIds.has(skill.id))
        .sort((a, b) => (b.jobCount ?? 0) - (a.jobCount ?? 0)),
    [skills, userSkillIds]
  )

  const sortedUserSkills = useMemo(
    () => [...userSkills].sort((a, b) => a.name.localeCompare(b.name)),
    [userSkills]
  )

  const selectedSkill = skills.find(
    skill => skill.name.toLowerCase() === skillInput.trim().toLowerCase()
  )

  const isAlreadyAdded = selectedSkill ? userSkillIds.has(selectedSkill.id) : false

  function handleAddSkill(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const value = skillInput.trim()
    if (!value || isAlreadyAdded) return

    createUserSkill.mutate(
      selectedSkill ? { skill_id: selectedSkill.id } : { name: value },
      { onSuccess: () => setSkillInput('') }
    )
  }

  const loading = skillsLoading || userSkillsLoading
  const error = skillsError || userSkillsError

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skill Gap Analysis</CardTitle>
        <p className="text-sm text-slate-500">
          Track your skills and compare them against demand from saved job listings.
        </p>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium mb-2">My Skills</h3>
            <form onSubmit={handleAddSkill} className="flex gap-2">
              <Input
                value={skillInput}
                onChange={e => setSkillInput(e.target.value)}
                list="skill-options"
                placeholder="Add a skill"
              />
              <datalist id="skill-options">
                {skills.filter(skill => !userSkillIds.has(skill.id)).map(skill => (
                  <option key={skill.id} value={skill.name} />
                ))}
              </datalist>
              <Button
                type="submit"
                size="sm"
                disabled={createUserSkill.isPending || !skillInput.trim() || isAlreadyAdded}
              >
                {createUserSkill.isPending ? 'Adding...' : 'Add'}
              </Button>
            </form>
          </div>

          {loading ? (
            <p className="text-sm text-slate-600">Loading skills...</p>
          ) : error ? (
            <p className="text-sm text-red-500">Failed to load skill data.</p>
          ) : sortedUserSkills.length === 0 ? (
            <p className="text-sm text-slate-500">No skills added yet.</p>
          ) : (
            <div className="space-y-2">
              {sortedUserSkills.map(skill => (
                <div key={skill.skillId} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <span>{skill.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-700"
                    disabled={deleteUserSkill.isPending}
                    onClick={() => deleteUserSkill.mutate(skill.skillId)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium">Skill Gaps</h3>
          {loading ? (
            <p className="text-sm text-slate-600">Loading gaps...</p>
          ) : error ? (
            <p className="text-sm text-red-500">Failed to load skill gaps.</p>
          ) : skillGaps.length === 0 ? (
            <p className="text-sm text-slate-500">No gaps found - great coverage!</p>
          ) : (
            <div className="space-y-2">
              {skillGaps.slice(0, 20).map(skill => (
                <div key={skill.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <span>{skill.name}</span>
                  <span className="text-xs text-slate-600">{skill.jobCount ?? 0} jobs</span>
                </div>
              ))}
              {skillGaps.length > 20 && (
                <p className="text-xs text-slate-600 text-center pt-1">
                  +{skillGaps.length - 20} more skills not shown
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
