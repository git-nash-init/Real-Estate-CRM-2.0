import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/permissions';
import { X, Upload, Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
}

interface ParsedLead {
  customer_name: string;
  mobile: string;
  configuration: string | null;
  budget: string | null;
  notes: string | null;
  cpName: string | null;
}

interface SheetAnalysis {
  sheetName: string;
  leads: ParsedLead[];
  skippedCount: number;
  colNames: {
    name?: string;
    mobile?: string;
    config?: string;
    budget?: string;
    notes?: string;
    cp?: string;
  };
}

/**
 * Clean and normalize phone numbers from Excel cells.
 * Strips non-digits, handles numbers/floats/scientific notation,
 * and strips common country codes (91, 0, 091) to yield clean mobile numbers.
 */
function cleanPhone(val: any): string {
  if (val === null || val === undefined) return '';
  let str = '';
  if (typeof val === 'number') {
    str = Math.round(val).toString();
  } else {
    str = String(val).trim();
  }
  let digits = str.replace(/[^0-9]/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  } else if (digits.length === 13 && digits.startsWith('091')) {
    digits = digits.slice(3);
  }
  return digits;
}

function cleanText(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Match column header text against common real-estate lead spreadsheet variations.
 */
function matchHeaderType(header: any): 'name' | 'mobile' | 'config' | 'budget' | 'cp' | 'notes' | 'email' | null {
  const norm = String(header || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  if (!norm) return null;

  // Skip typical metadata/row index columns
  if (norm.includes('srno') || norm.includes('serial') || norm.includes('date') || norm.includes('time') || norm === 'id' || norm === 'sno') {
    return null;
  }

  // Channel Partner (checked first so "Channel Partner Name" isn't misidentified as lead name)
  const cpAliases = ['channelpartner', 'channelpartnername', 'cpname', 'cp', 'broker', 'brokername', 'agent', 'agentname', 'referral', 'sourcecp'];
  if (cpAliases.some(a => norm === a || norm.includes(a))) return 'cp';

  // Mobile / Phone
  const mobileAliases = ['mobilenumber', 'mobileno', 'mobile', 'phonenumber', 'phoneno', 'phone', 'contactnumber', 'contactno', 'contact', 'whatsapp', 'cell', 'tel', 'callingnumber', 'callnumber', 'number', 'mob'];
  if (mobileAliases.some(a => norm === a || (norm.includes(a) && !norm.includes('person')))) return 'mobile';

  // Configuration / Typology / Requirement
  const configAliases = ['configuration', 'config', 'requirement', 'requirements', 'req', 'typology', 'bhk', 'unittype', 'propertytype', 'flattype'];
  if (configAliases.some(a => norm === a || norm.includes(a))) return 'config';

  // Budget
  const budgetAliases = ['budget', 'budgetrange', 'price', 'pricing', 'cost', 'investment', 'budgetlacs'];
  if (budgetAliases.some(a => norm === a || norm.includes(a))) return 'budget';

  // Notes / Remarks / Status
  const notesAliases = ['remark', 'remarks', 'remark1', 'remark2', 'note', 'notes', 'comment', 'comments', 'feedback', 'stay', 'callingstatus', 'callstatus'];
  if (notesAliases.some(a => norm === a || norm.includes(a))) return 'notes';

  // Email
  const emailAliases = ['email', 'emailid', 'mail'];
  if (emailAliases.some(a => norm === a || norm.includes(a))) return 'email';

  // Lead / Customer / Client Name
  const nameAliases = ['customername', 'clientname', 'leadname', 'fullname', 'custname', 'customer', 'client', 'prospect', 'lead', 'name', 'contactperson', 'buyer'];
  if (nameAliases.some(a => norm === a || norm.includes(a))) return 'name';

  return null;
}

/**
 * Robust Excel workbook parser.
 * Handles:
 * - Title banners or metadata rows before actual headers
 * - Any column order (e.g. SR NO, DATE, NAME, CONTACT, REQUIREMENT, BUDGET, REMARK)
 * - Multi-sheet workbooks
 * - Heuristic fallback if headers are unlabelled
 */
function parseWorkbookBuffer(buffer: ArrayBuffer): SheetAnalysis[] {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
  const results: SheetAnalysis[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rawRows || rawRows.length === 0) continue;

    let headerRowIdx = -1;
    let colMap = { name: -1, mobile: -1, config: -1, budget: -1, cp: -1, notes: -1 };
    let colNames: Record<string, string> = {};

    // Scan top 20 rows for header row
    for (let r = 0; r < Math.min(rawRows.length, 20); r++) {
      const row = rawRows[r];
      if (!Array.isArray(row)) continue;

      let nIdx = -1, mIdx = -1, cfgIdx = -1, bIdx = -1, cpIdx = -1, notIdx = -1;
      let matchedHeadersCount = 0;

      row.forEach((cell, idx) => {
        const type = matchHeaderType(cell);
        if (type === 'name' && nIdx === -1) { nIdx = idx; matchedHeadersCount++; }
        else if (type === 'mobile' && mIdx === -1) { mIdx = idx; matchedHeadersCount++; }
        else if (type === 'config' && cfgIdx === -1) { cfgIdx = idx; matchedHeadersCount++; }
        else if (type === 'budget' && bIdx === -1) { bIdx = idx; matchedHeadersCount++; }
        else if (type === 'cp' && cpIdx === -1) { cpIdx = idx; matchedHeadersCount++; }
        else if (type === 'notes' && notIdx === -1) { notIdx = idx; matchedHeadersCount++; }
      });

      // Valid header row if mobile is matched, or at least 2 headers matched
      if (mIdx !== -1 || (nIdx !== -1 && matchedHeadersCount >= 2)) {
        headerRowIdx = r;
        colMap = { name: nIdx, mobile: mIdx, config: cfgIdx, budget: bIdx, cp: cpIdx, notes: notIdx };
        row.forEach((cell, idx) => {
          if (idx === nIdx) colNames.name = cleanText(cell);
          if (idx === mIdx) colNames.mobile = cleanText(cell);
          if (idx === cfgIdx) colNames.config = cleanText(cell);
          if (idx === bIdx) colNames.budget = cleanText(cell);
          if (idx === cpIdx) colNames.cp = cleanText(cell);
          if (idx === notIdx) colNames.notes = cleanText(cell);
        });
        break;
      }
    }

    // Heuristic fallback: if mobile column wasn't detected by header, inspect sample data
    if (colMap.mobile === -1) {
      const sample = rawRows.slice(0, 30);
      const phoneScores: number[] = [];
      const nameScores: number[] = [];

      sample.forEach(r => {
        if (!Array.isArray(r)) return;
        r.forEach((c, idx) => {
          const ph = cleanPhone(c);
          if (ph.length >= 10 && ph.length <= 13) {
            phoneScores[idx] = (phoneScores[idx] || 0) + 1;
          }
          const s = cleanText(c);
          if (/^[a-zA-Z\s]{2,40}$/.test(s) && !/date|phone|mobile|status|sr|contact/i.test(s)) {
            nameScores[idx] = (nameScores[idx] || 0) + 1;
          }
        });
      });

      let bestMobile = -1, maxPh = 0;
      phoneScores.forEach((score, idx) => {
        if (score > maxPh) { maxPh = score; bestMobile = idx; }
      });

      if (bestMobile !== -1) {
        colMap.mobile = bestMobile;
        colNames.mobile = 'Auto-detected';
        let bestName = -1, maxNm = 0;
        nameScores.forEach((score, idx) => {
          if (idx !== bestMobile && score > maxNm) { maxNm = score; bestName = idx; }
        });
        if (bestName !== -1) {
          colMap.name = bestName;
          colNames.name = 'Auto-detected';
        }
        if (headerRowIdx === -1) headerRowIdx = 0;
      }
    }

    if (colMap.mobile === -1) continue;

    const dataRows = rawRows.slice(headerRowIdx + 1);
    const parsed: ParsedLead[] = [];
    let skippedInvalid = 0;

    dataRows.forEach(row => {
      if (!Array.isArray(row) || row.length === 0) return;
      const phone = cleanPhone(colMap.mobile !== -1 ? row[colMap.mobile] : '');
      if (!phone || phone.length < 10) {
        const hasContent = row.some(c => c !== null && c !== undefined && String(c).trim() !== '');
        if (hasContent) skippedInvalid++;
        return;
      }

      let name = colMap.name !== -1 ? cleanText(row[colMap.name]) : '';
      if (!name || /^[0-9]+$/.test(name)) name = 'Unknown';

      parsed.push({
        customer_name: name,
        mobile: phone,
        configuration: colMap.config !== -1 ? cleanText(row[colMap.config]) || null : null,
        budget: colMap.budget !== -1 ? cleanText(row[colMap.budget]) || null : null,
        notes: colMap.notes !== -1 ? cleanText(row[colMap.notes]) || null : null,
        cpName: colMap.cp !== -1 ? cleanText(row[colMap.cp]) || null : null,
      });
    });

    results.push({
      sheetName,
      leads: parsed,
      skippedCount: skippedInvalid,
      colNames
    });
  }

  return results;
}

export const BulkUploadModal: React.FC<BulkUploadModalProps> = ({ isOpen, onClose, onUploadComplete }) => {
  const { user, role, assignedProjects } = useAuth();
  const isChannelPartner = role === 'channel_partner';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'file' | 'single'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [parsedSheets, setParsedSheets] = useState<SheetAnalysis[]>([]);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [parsingFile, setParsingFile] = useState(false);

  const [singleName, setSingleName] = useState('');
  const [singleMobile, setSingleMobile] = useState('');
  const [singleConfig, setSingleConfig] = useState('');
  const [singleBudget, setSingleBudget] = useState('');
  const [projectId, setProjectId] = useState('');
  const [channelPartnerId, setChannelPartnerId] = useState('');
  const [telecallerIds, setTelecallerIds] = useState<string[]>([]);

  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [partners, setPartners] = useState<{ id: string; name: string; company_name: string | null }[]>([]);
  const [telecallers, setTelecallers] = useState<{ id: string; name: string }[]>([]);
  const [projectTeamMap, setProjectTeamMap] = useState<Map<string, Set<string>>>(new Map());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchDropdownData();
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setMode('file');
    setFile(null);
    setParsedSheets([]);
    setSelectedSheetIndex(0);
    setParsingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSingleName('');
    setSingleMobile('');
    setSingleConfig('');
    setSingleBudget('');
    const initialProjectId = (!isSuperAdmin(role) && assignedProjects && assignedProjects.length === 1)
      ? assignedProjects[0]
      : '';
    setProjectId(initialProjectId);
    setChannelPartnerId('');
    setTelecallerIds([]);
    setError(null);
    setSuccess(null);
  };

  const fetchDropdownData = async () => {
    try {
      if (isChannelPartner) {
        const { data: ownCp } = await supabase.from('channel_partners').select('id').eq('user_id', user?.id).maybeSingle();
        if (ownCp) {
          setChannelPartnerId(ownCp.id);
          const { data: assignments } = await supabase.from('channel_partner_projects').select('project_id, projects(project_name)').eq('channel_partner_id', ownCp.id);
          setProjects((assignments || []).map((a: any) => ({ id: a.project_id, name: a.projects?.project_name || 'Unknown' })));
        }
        return;
      }

      // Fetch Projects - scoped to user's assigned projects for non-super-admins
      const { data: projData } = await supabase.from('projects').select('id, project_name');
      let initialPid = '';
      if (projData) {
        const filtered = projData.filter(p => isSuperAdmin(role) || (assignedProjects && assignedProjects.includes(p.id)));
        setProjects(filtered.map(p => ({ id: p.id, name: p.project_name })));
        if (!isSuperAdmin(role) && assignedProjects && assignedProjects.length === 1) {
          initialPid = assignedProjects[0];
          setProjectId(initialPid);
        }
      }

      // Fetch Channel Partners
      const { data: cpData } = await supabase.from('channel_partners').select('id, name, company_name').eq('status', 'active');
      if (cpData) setPartners(cpData.map(c => ({ id: c.id, name: c.name, company_name: c.company_name })));

      // Fetch project team assignments (user_project_assignments) to scope telecallers by project
      const { data: assignData, error: aErr } = await supabase
        .from('user_project_assignments')
        .select('user_id, project_id')
        .eq('is_active', true);
      if (aErr) console.error('Error fetching user_project_assignments:', aErr);
      const teamMap = new Map<string, Set<string>>();
      (assignData || []).forEach(row => {
        if (!teamMap.has(row.project_id)) teamMap.set(row.project_id, new Set());
        teamMap.get(row.project_id)!.add(row.user_id);
      });
      setProjectTeamMap(teamMap);

      // Fetch Telecallers (role = presales or presales_tl)
      const { data: roles, error: rErr } = await supabase.from('roles').select('id, name');
      if (rErr) console.error('Error fetching roles:', rErr);
      const tcRoleIds = (roles || []).filter(r => ['presales', 'presales_tl'].includes(r.name)).map(r => r.id);

      if (tcRoleIds.length > 0) {
        const { data: userRoles, error: urErr } = await supabase.from('user_roles').select('user_id').in('role_id', tcRoleIds);
        if (urErr) console.error('Error fetching user_roles:', urErr);
        if (userRoles && userRoles.length > 0) {
          const userIds = userRoles.map(ur => ur.user_id);
          const { data: profiles, error: pErr } = await supabase.from('user_profiles').select('id, full_name, status').in('id', userIds);
          if (pErr) console.error('Error fetching user_profiles:', pErr);
          if (profiles) {
            const activeTcs = profiles
              .filter(p => p.status === 'active')
              .map(p => ({ id: p.id, name: p.full_name || 'Unknown' }));
            setTelecallers(activeTcs);

            // Auto-select telecallers if initial project is already set
            if (initialPid && teamMap.has(initialPid)) {
              const assignedIds = activeTcs.filter(tc => teamMap.get(initialPid)!.has(tc.id)).map(tc => tc.id);
              setTelecallerIds(assignedIds);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch dropdown data for bulk upload', err);
    }
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Customer Name', 'Mobile Number', 'Configuration', 'Budget', 'Channel Partner Name', 'Notes']
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    XLSX.writeFile(wb, 'Bulk_Leads_Template.xlsx');
  };

  const handleProjectChange = (newProjectId: string) => {
    setProjectId(newProjectId);
    const newTeam = projectTeamMap.get(newProjectId);
    if (newTeam) {
      // Auto-select all presales assigned to this project by default for round-robin
      const defaultTcIds = telecallers.filter(tc => newTeam.has(tc.id)).map(tc => tc.id);
      setTelecallerIds(defaultTcIds);
    } else {
      setTelecallerIds([]);
    }
  };

  const visibleTelecallers = projectId
    ? telecallers.filter(tc => projectTeamMap.get(projectId)?.has(tc.id))
    : [];

  const toggleTelecaller = (id: string) => {
    setTelecallerIds(prev =>
      prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    setParsedSheets([]);
    setSelectedSheetIndex(0);
    setError(null);

    if (!selectedFile) return;

    try {
      setParsingFile(true);
      const buffer = await selectedFile.arrayBuffer();
      const sheets = parseWorkbookBuffer(buffer);

      if (sheets.length === 0 || sheets.every(s => s.leads.length === 0)) {
        setError(
          'Could not detect valid lead records in this Excel file. Ensure your spreadsheet contains Customer Name and Mobile Number columns with valid 10-digit mobile numbers.'
        );
      } else {
        setParsedSheets(sheets);
        // Default to first sheet with leads
        const firstValidIdx = sheets.findIndex(s => s.leads.length > 0);
        setSelectedSheetIndex(firstValidIdx >= 0 ? firstValidIdx : 0);
      }
    } catch (err: any) {
      console.error('Error parsing excel file:', err);
      setError(`Failed to read Excel file: ${err.message || 'Unknown error'}`);
    } finally {
      setParsingFile(false);
    }
  };

  const generateLeadNumber = async () => {
    const { data: maxLeadData } = await supabase
      .from('leads')
      .select('lead_number')
      .order('lead_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!maxLeadData?.lead_number) return 'LD-10001';

    const match = maxLeadData.lead_number.match(/^([a-zA-Z\-_]*?)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const numStr = match[2];
      const nextNum = parseInt(numStr, 10) + 1;
      return `${prefix}${String(nextNum).padStart(numStr.length, '0')}`;
    }
    return `LD-${Date.now()}`;
  };

  const currentSheet = parsedSheets[selectedSheetIndex];

  const handleUpload = async () => {
    if (mode === 'file') {
      if (!file) return setError('Please select an Excel file.');
      if (parsedSheets.length === 0 || !currentSheet || currentSheet.leads.length === 0) {
        return setError('The selected Excel sheet does not contain valid leads. Ensure it has Customer Name and Mobile Number columns.');
      }
    }
    if (mode === 'single' && (!singleName.trim() || !singleMobile.trim())) {
      return setError('Please enter both Customer Name and Mobile Number.');
    }
    if (!projectId) return setError('Please select a project.');

    if (!isChannelPartner && visibleTelecallers.length > 0 && telecallerIds.length === 0) {
      return setError('Please select at least one Presales (Telecaller) before uploading.');
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let leadsToProcess: ParsedLead[];
      if (mode === 'single') {
        const cleanSinglePhone = cleanPhone(singleMobile);
        if (!cleanSinglePhone || cleanSinglePhone.length < 10) {
          throw new Error('Please enter a valid 10-digit mobile number.');
        }
        leadsToProcess = [{
          customer_name: singleName.trim(),
          mobile: cleanSinglePhone,
          configuration: singleConfig.trim() || null,
          budget: singleBudget.trim() || null,
          notes: null,
          cpName: null,
        }];
      } else {
        leadsToProcess = currentSheet.leads;
      }

      // 1. Create Bulk Upload Directory Record
      const { data: bulkRecord, error: bulkErr } = await supabase.from('bulk_lead_uploads').insert({
        file_name: mode === 'single' ? `Manual Entry — ${singleName.trim()}` : file!.name,
        uploaded_by: user?.id,
        project_id: projectId,
        channel_partner_id: channelPartnerId || null
      }).select('id').single();

      if (bulkErr || !bulkRecord) throw new Error(bulkErr?.message || 'Failed to create bulk upload record.');

      // 2. Prepare Leads data
      const leadBaseNumber = await generateLeadNumber();
      let prefix = 'LD-';
      let startNum = 10001;
      const match = leadBaseNumber.match(/^([a-zA-Z\-_]*?)(\d+)$/);
      if (match) {
        prefix = match[1];
        startNum = parseInt(match[2], 10);
      }

      const newLeads = leadsToProcess.map((lead, index) => {
        let assignedTelecaller = null;
        if (telecallerIds.length > 0) {
          assignedTelecaller = telecallerIds[index % telecallerIds.length];
        }

        const lNum = `${prefix}${String(startNum + index).padStart(Math.max(String(startNum).length, 5), '0')}`;

        // If CP was chosen in dropdown, use that.
        // Otherwise if lead has cpName and partner exists in partners list, map it.
        let resolvedCpId = channelPartnerId || null;
        if (!resolvedCpId && lead.cpName) {
          const matchCp = partners.find(
            p => (p.company_name && p.company_name.toLowerCase() === lead.cpName?.toLowerCase()) ||
                 (p.name && p.name.toLowerCase() === lead.cpName?.toLowerCase())
          );
          if (matchCp) resolvedCpId = matchCp.id;
        }

        return {
          lead_number: lNum,
          customer_name: lead.customer_name || 'Unknown',
          mobile: lead.mobile,
          configuration: lead.configuration || null,
          budget: lead.budget || null,
          channel_partner_id: resolvedCpId,
          project_id: projectId,
          telecaller_id: assignedTelecaller,
          bulk_upload_id: bulkRecord.id,
          created_by: user?.id,
          owner_id: user?.id,
          status: 'new' as const,
          source: 'bulk_upload',
          notes: lead.notes || null,
        };
      });

      // 3. Prevent duplicate mobile numbers within this project
      const normPhone = (p: string) => {
        let d = (p || '').replace(/[^0-9]/g, '');
        if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
        else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
        else if (d.length === 13 && d.startsWith('091')) d = d.slice(3);
        return d;
      };

      const existing = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data: existingRows } = await supabase
          .from('leads').select('mobile').eq('project_id', projectId).range(from, from + 999);
        (existingRows || []).forEach((r: any) => existing.add(normPhone(r.mobile)));
        if (!existingRows || existingRows.length < 1000) break;
      }

      let skipped = 0;
      const toInsert = newLeads.filter((l) => {
        const n = normPhone(l.mobile);
        if (!n) { skipped++; return false; }
        if (existing.has(n)) { skipped++; return false; }
        existing.add(n);
        return true;
      });

      let inserted = 0;
      const chunkSize = 100;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { error: insertErr } = await supabase.from('leads').insert(chunk);
        if (!insertErr) { inserted += chunk.length; continue; }
        if (insertErr.code !== '23505') throw new Error(`Error inserting leads: ${insertErr.message}`);
        // A duplicate this user can't see (RLS) or a race -- retry row by row.
        for (const lead of chunk) {
          const { error: rowErr } = await supabase.from('leads').insert(lead);
          if (!rowErr) inserted++;
          else if (rowErr.code === '23505') skipped++;
          else throw new Error(`Error inserting leads: ${rowErr.message}`);
        }
      }

      if (inserted === 0) {
        await supabase.from('bulk_lead_uploads').delete().eq('id', bulkRecord.id);
        throw new Error(
          `No leads were uploaded: all ${newLeads.length} number(s) already exist in this project (or are blank/repeated in the file).`
        );
      }

      setSuccess(
        mode === 'single'
          ? 'Lead added successfully.'
          : `Successfully uploaded ${inserted} lead(s).${skipped > 0 ? ` ${skipped} skipped (mobile already exists in this project, blank, or repeated in the file).` : ''}`
      );
      setTimeout(() => {
        onUploadComplete();
        onClose();
      }, 2000);

    } catch (err: any) {
      setError(err.message || 'An error occurred during upload.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 shrink-0">
          <h2 className="text-xl font-semibold text-slate-800">{mode === 'single' ? 'Add Single Lead' : 'Bulk Upload Leads'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-2 -mr-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="p-4 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
            {(['file', 'single'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-4 py-2 text-xs font-semibold transition-all ${mode === m ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {m === 'file' ? 'Upload File' : 'Add Single Lead'}
              </button>
            ))}
          </div>

          {mode === 'file' && (
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div>
                <p className="text-sm font-medium text-slate-700">Need the template?</p>
                <p className="text-xs text-slate-500 mt-1">Download the empty Excel template with required columns.</p>
              </div>
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Template
              </button>
            </div>
          )}

          <div className="space-y-4">
            {mode === 'file' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Upload File *</label>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 border border-slate-300 rounded-lg"
                />

                {parsingFile && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-indigo-600">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing spreadsheet columns and rows...</span>
                  </div>
                )}

                {parsedSheets.length > 0 && currentSheet && (
                  <div className="mt-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                    {parsedSheets.length > 1 && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Select Sheet ({parsedSheets.length} sheets found in workbook)
                        </label>
                        <select
                          value={selectedSheetIndex}
                          onChange={(e) => setSelectedSheetIndex(Number(e.target.value))}
                          className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500"
                        >
                          {parsedSheets.map((s, idx) => (
                            <option key={idx} value={idx}>
                              {s.sheetName} ({s.leads.length} leads{s.skippedCount > 0 ? `, ${s.skippedCount} skipped` : ''})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        {currentSheet.leads.length} lead(s) ready to import
                      </span>
                      {currentSheet.skippedCount > 0 && (
                        <span className="text-[11px] text-slate-400">
                          ({currentSheet.skippedCount} empty or non-lead rows skipped)
                        </span>
                      )}
                    </div>

                    {/* Column mapping tags */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {currentSheet.colNames.name && (
                        <span className="text-[11px] px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-600">
                          Name: <strong className="text-slate-800">{currentSheet.colNames.name}</strong>
                        </span>
                      )}
                      {currentSheet.colNames.mobile && (
                        <span className="text-[11px] px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-600">
                          Mobile: <strong className="text-slate-800">{currentSheet.colNames.mobile}</strong>
                        </span>
                      )}
                      {currentSheet.colNames.config && (
                        <span className="text-[11px] px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-600">
                          Config: <strong className="text-slate-800">{currentSheet.colNames.config}</strong>
                        </span>
                      )}
                      {currentSheet.colNames.budget && (
                        <span className="text-[11px] px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-600">
                          Budget: <strong className="text-slate-800">{currentSheet.colNames.budget}</strong>
                        </span>
                      )}
                      {currentSheet.colNames.notes && (
                        <span className="text-[11px] px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-600">
                          Notes: <strong className="text-slate-800">{currentSheet.colNames.notes}</strong>
                        </span>
                      )}
                    </div>

                    {/* Preview of first 3 leads */}
                    {currentSheet.leads.length > 0 && (
                      <div className="text-[11px] text-slate-500 bg-white p-2 rounded border border-slate-200 space-y-1">
                        <p className="font-semibold text-slate-700">Preview (first {Math.min(3, currentSheet.leads.length)}):</p>
                        {currentSheet.leads.slice(0, 3).map((lead, i) => (
                          <div key={i} className="truncate">
                            • <span className="font-medium text-slate-800">{lead.customer_name}</span> ({lead.mobile})
                            {lead.configuration ? ` — ${lead.configuration}` : ''}
                            {lead.budget ? ` [${lead.budget}]` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name *</label>
                  <input
                    type="text"
                    value={singleName}
                    onChange={(e) => setSingleName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mobile Number *</label>
                  <input
                    type="text"
                    value={singleMobile}
                    onChange={(e) => setSingleMobile(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Configuration</label>
                  <input
                    type="text"
                    placeholder="e.g. 1 BHK"
                    value={singleConfig}
                    onChange={(e) => setSingleConfig(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Budget</label>
                  <input
                    type="text"
                    placeholder="e.g. 35 L"
                    value={singleBudget}
                    onChange={(e) => setSingleBudget(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Project *</label>
              <select
                value={projectId}
                onChange={(e) => handleProjectChange(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              >
                <option value="">Select a Project</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {isChannelPartner ? (
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 text-sm text-indigo-800">
                These leads will be attributed to you automatically as the referring Channel Partner. Staff will assign a Presales (Telecaller) after review.
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Channel Partner (Optional)</label>
                  <select
                    value={channelPartnerId}
                    onChange={(e) => setChannelPartnerId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  >
                    <option value="">No specific partner</option>
                    {partners.map(p => (
                      <option key={p.id} value={p.id}>{p.company_name || p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Assign Presales (Telecaller) — Round-Robin</label>
                  <div className="border border-slate-300 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                    {!projectId ? (
                      <p className="text-sm text-slate-400 italic">Please select a project above to see assigned Presales (Telecallers).</p>
                    ) : visibleTelecallers.length === 0 ? (
                      <p className="text-sm text-amber-600 italic">No Presales (Telecaller) staff assigned to this project.</p>
                    ) : (
                      visibleTelecallers.map(tc => (
                        <label key={tc.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={telecallerIds.includes(tc.id)}
                            onChange={() => toggleTelecaller(tc.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          {tc.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 shrink-0 flex justify-end gap-3 bg-slate-50 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={
              loading ||
              !projectId ||
              (mode === 'file' ? (!file || !currentSheet || currentSheet.leads.length === 0) : (!singleName.trim() || !singleMobile.trim()))
            }
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {loading ? (mode === 'single' ? 'Adding...' : 'Uploading...') : (mode === 'single' ? 'Add Lead' : 'Upload Leads')}
          </button>
        </div>
      </div>
    </div>
  );
};
