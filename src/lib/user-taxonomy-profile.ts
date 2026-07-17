import { z } from 'zod'
import { taxonomyCategorySchema, type TaxonomyCategory } from '@/lib/taxonomy'

export const profileCategorySchema = taxonomyCategorySchema
export type ProfileCategory = TaxonomyCategory

export const softwareFamiliaritySchema = z.enum([
  'learning',
  'familiar',
  'proficient',
  'expert',
])
export const keywordPreferenceSchema = z.enum(['interest', 'exclusion'])

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO date (YYYY-MM-DD)')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
  }, 'Must be a valid calendar date')

const httpUrlSchema = z.string().url().max(2_000).refine(
  (value) => value.startsWith('http://') || value.startsWith('https://'),
  'Must use http or https',
)

const associationTargetSchema = z.object({
  taxonomy_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(300).optional(),
})

function requireOneTarget<Shape extends z.ZodRawShape>(shape: Shape) {
  return associationTargetSchema.extend(shape).strict().refine((value) => {
    const target = value as { taxonomy_id?: number; name?: string }
    return (target.taxonomy_id === undefined) !== (target.name === undefined)
  }, 'Provide exactly one of taxonomy_id or name')
}

const skillCreateSchema = requireOneTarget({
  has_skill: z.boolean().optional().default(true),
})

const softwareCreateSchema = requireOneTarget({
  familiarity: softwareFamiliaritySchema.nullable().optional(),
})

const certificationMetadataSchema = z.object({
  issuer: z.string().trim().min(1).max(300).nullable().optional(),
  earned_date: isoDateSchema.nullable().optional(),
  expires_at: isoDateSchema.nullable().optional(),
  credential_url: httpUrlSchema.nullable().optional(),
}).strict()

const certificationCreateSchema = requireOneTarget(certificationMetadataSchema.shape)
  .superRefine((value, context) => {
    if (value.earned_date && value.expires_at && value.expires_at < value.earned_date) {
      context.addIssue({
        code: 'custom',
        path: ['expires_at'],
        message: 'Expiration date must not precede earned date',
      })
    }
  })

const keywordCreateSchema = requireOneTarget({
  preference: keywordPreferenceSchema.optional().default('interest'),
})

const skillPatchSchema = z.object({ has_skill: z.boolean() }).strict()
const softwarePatchSchema = z.object({ familiarity: softwareFamiliaritySchema.nullable() }).strict()
const certificationPatchSchema = certificationMetadataSchema
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')
  .superRefine((value, context) => {
    if (value.earned_date && value.expires_at && value.expires_at < value.earned_date) {
      context.addIssue({
        code: 'custom',
        path: ['expires_at'],
        message: 'Expiration date must not precede earned date',
      })
    }
  })
const keywordPatchSchema = z.object({ preference: keywordPreferenceSchema }).strict()

export const profileCreateSchemas = {
  skills: skillCreateSchema,
  software: softwareCreateSchema,
  certifications: certificationCreateSchema,
  keywords: keywordCreateSchema,
} as const

export const profilePatchSchemas = {
  skills: skillPatchSchema,
  software: softwarePatchSchema,
  certifications: certificationPatchSchema,
  keywords: keywordPatchSchema,
} as const

export function parsePositiveProfileId(value: string) {
  if (!/^\d+$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
