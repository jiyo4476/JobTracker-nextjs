'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/layout/PageHeader'
import { useCompany, usePatchCompany } from '@/lib/queries'
import type { CompanyDetail } from '@/types/queries'

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'] as const
const FIELD_CLASS = 'space-y-1.5'
const LABEL_CLASS = 'text-sm font-medium text-slate-700'
const SELECT_CLASS = 'flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50'

function isHttpUrl(value: string) {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const optionalUrl = z.string().trim().refine(isHttpUrl, 'Enter a valid URL, including https://')

export const companyEditSchema = z.object({
  name: z.string().trim().min(1, 'Company name is required.').max(255, 'Company name must be 255 characters or fewer.'),
  website: optionalUrl,
  hqLocation: z.string().max(300, 'Location must be 300 characters or fewer.'),
  industry: z.string().max(300, 'Industry must be 300 characters or fewer.'),
  size: z.enum(COMPANY_SIZES).or(z.literal('')),
  description: z.string().max(5000, 'Description must be 5,000 characters or fewer.'),
  linkedinUrl: optionalUrl,
  glassdoorUrl: optionalUrl,
})

export type CompanyEditValues = z.infer<typeof companyEditSchema>

export function companyToFormValues(company: CompanyDetail): CompanyEditValues {
  return {
    name: company.name,
    website: company.website ?? '',
    hqLocation: company.hqLocation ?? '',
    industry: company.industry ?? '',
    size: company.sizeRange && COMPANY_SIZES.includes(company.sizeRange as (typeof COMPANY_SIZES)[number])
      ? company.sizeRange as (typeof COMPANY_SIZES)[number]
      : '',
    description: company.notes ?? '',
    linkedinUrl: company.linkedinUrl ?? '',
    glassdoorUrl: company.glassdoorUrl ?? '',
  }
}

export function buildCompanyPatch(values: CompanyEditValues) {
  const nullable = (value: string) => value.trim() || null

  return {
    name: values.name.trim(),
    website: nullable(values.website),
    hq_location: nullable(values.hqLocation),
    industry: nullable(values.industry),
    size_range: values.size || null,
    notes: nullable(values.description),
    linkedin_url: nullable(values.linkedinUrl),
    glassdoor_url: nullable(values.glassdoorUrl),
  }
}

export default function CompanyEditPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const companyId = Number(id)
  const isValidId = Number.isInteger(companyId) && companyId > 0
  const { data: company, isLoading, isError } = useCompany(companyId)
  const patchCompany = usePatchCompany()
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<CompanyEditValues>({
    resolver: zodResolver(companyEditSchema),
    defaultValues: {
      name: '', website: '', hqLocation: '', industry: '', size: '',
      description: '', linkedinUrl: '', glassdoorUrl: '',
    },
  })

  useEffect(() => {
    // Refetches must not discard edits the user has already made.
    if (company && !isDirty) reset(companyToFormValues(company))
  }, [company, isDirty, reset])

  const descriptionLength = (useWatch({ control, name: 'description' }) ?? '').length
  const detailHref = isValidId ? `/companies/${companyId}` : '/companies'

  function onSubmit(values: CompanyEditValues) {
    if (!isValidId) return
    patchCompany.mutate(
      { id: companyId, ...buildCompanyPatch(values) },
      {
        onSuccess: () => {
          toast.success('Company profile updated')
          router.push(detailHref)
        },
      },
    )
  }

  if (!isValidId || isError) {
    return (
      <div className="p-4 sm:p-8">
        <PageHeader title="Company not found" description="This company could not be loaded." />
        <Button variant="outline" onClick={() => router.push('/companies')}>Back to Companies</Button>
      </div>
    )
  }

  if (isLoading || !company) {
    return (
      <div className="p-4 sm:p-8">
        <Skeleton className="mb-2 h-8 w-64" />
        <Skeleton className="mb-6 h-4 w-80 max-w-full" />
        <Card className="max-w-3xl"><CardContent className="space-y-5 pt-6">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}</CardContent></Card>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8">
      <Link href={detailHref} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to company
      </Link>
      <PageHeader title="Edit Company Profile" description={`Update profile information for ${company.name}.`} />

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-6" noValidate>
        <Card>
          <CardHeader><CardTitle>Company Basic Info</CardTitle></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className={`${FIELD_CLASS} sm:col-span-2`}>
              <label htmlFor="name" className={LABEL_CLASS}>Company Name</label>
              <Input id="name" {...register('name')} aria-invalid={!!errors.name} maxLength={255} />
              {errors.name && <p role="alert" className="text-sm text-red-600">{errors.name.message}</p>}
            </div>
            <div className={FIELD_CLASS}>
              <label htmlFor="website" className={LABEL_CLASS}>Website</label>
              <Input id="website" type="url" placeholder="https://company.com" {...register('website')} aria-invalid={!!errors.website} />
              {errors.website && <p role="alert" className="text-sm text-red-600">{errors.website.message}</p>}
            </div>
            <div className={FIELD_CLASS}>
              <label htmlFor="hqLocation" className={LABEL_CLASS}>Location</label>
              <Input id="hqLocation" placeholder="San Francisco, CA" {...register('hqLocation')} aria-invalid={!!errors.hqLocation} />
              {errors.hqLocation && <p role="alert" className="text-sm text-red-600">{errors.hqLocation.message}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Company Details</CardTitle></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className={FIELD_CLASS}>
              <label htmlFor="industry" className={LABEL_CLASS}>Industry</label>
              <Input id="industry" placeholder="Software / SaaS" {...register('industry')} aria-invalid={!!errors.industry} />
              {errors.industry && <p role="alert" className="text-sm text-red-600">{errors.industry.message}</p>}
            </div>
            <div className={FIELD_CLASS}>
              <label htmlFor="size" className={LABEL_CLASS}>Company Size</label>
              <select id="size" {...register('size')} className={SELECT_CLASS}>
                <option value="">Not set</option>
                {COMPANY_SIZES.map(size => <option key={size} value={size}>{size} employees</option>)}
              </select>
            </div>
            <div className={`${FIELD_CLASS} sm:col-span-2`}>
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="description" className={LABEL_CLASS}>Description</label>
                <span className="text-xs text-slate-500" aria-live="polite">{descriptionLength.toLocaleString()} / 5,000</span>
              </div>
              <Textarea id="description" rows={8} {...register('description')} aria-invalid={!!errors.description} />
              {errors.description && <p role="alert" className="text-sm text-red-600">{errors.description.message}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Profile Links</CardTitle></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className={FIELD_CLASS}>
              <label htmlFor="linkedinUrl" className={LABEL_CLASS}>LinkedIn URL</label>
              <Input id="linkedinUrl" type="url" placeholder="https://linkedin.com/company/..." {...register('linkedinUrl')} aria-invalid={!!errors.linkedinUrl} />
              {errors.linkedinUrl && <p role="alert" className="text-sm text-red-600">{errors.linkedinUrl.message}</p>}
            </div>
            <div className={FIELD_CLASS}>
              <label htmlFor="glassdoorUrl" className={LABEL_CLASS}>Glassdoor URL</label>
              <Input id="glassdoorUrl" type="url" placeholder="https://glassdoor.com/..." {...register('glassdoorUrl')} aria-invalid={!!errors.glassdoorUrl} />
              {errors.glassdoorUrl && <p role="alert" className="text-sm text-red-600">{errors.glassdoorUrl.message}</p>}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => router.push(detailHref)} disabled={patchCompany.isPending}>Cancel</Button>
          <Button type="submit" disabled={!isDirty || patchCompany.isPending}>
            {patchCompany.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  )
}
