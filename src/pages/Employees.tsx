import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { reportQueryError } from '../services/queryLogger';
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  AlertCircle,
  Users,
  CheckCircle,
  Edit2
} from 'lucide-react';
import type { UserRole } from '../types/auth';

interface Employee {
  id: string;
  employee_id: string | null;
  first_name: string | null;
  last_name: string | null;
  profile_photo: string | null;
  gender: string | null;
  date_of_birth: string | null;
  mobile: string | null;
  alternate_mobile: string | null;
  personal_email: string | null;
  department: string | null;
  designation: string | null;
  joining_date: string | null;
  employment_type: string | null;
  employment_status: string | null;
  reporting_manager: string | null;
  official_email: string | null;
  work_location: string | null;
  branch: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface RoleObj {
  id: string;
  name: string;
}

interface ManagerLookup {
  id: string;
  name: string;
  designation: string;
}

const ROLES: UserRole[] = [
  'super_admin',
  'project_admin',
  'site_head',
  'sourcing_manager_tl',
  'sourcing_manager',
  'telecaller',
  'presales_tl',
  'presales',
  'closing_manager_tl',
  'closing_manager',
  'marketing_head',
  'marketing',
  'receptionist'
];

// Cryptographically random password for newly auto-created accounts.
// Replaces the previous hardcoded 'TempPassword123!' used for every
// account, which was visible in source control and, combined with the
// predictable {employee_code}@estatecrm.internal fallback email, meant
// anyone who knew or guessed an employee code could log in as them.
// Shown once to the admin on screen; never logged or stored — the account
// is also flagged must_change_password so it can't be used long-term.
function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export const Employees: React.FC = () => {
  // Query & state filters
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [desigFilter, setDesigFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Pagination states
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Data states
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [rolesList, setRolesList] = useState<RoleObj[]>([]);
  const [managersLookup, setManagersLookup] = useState<ManagerLookup[]>([]);
  const [userRolesMap, setUserRolesMap] = useState<Map<string, string>>(new Map()); // user_id -> role_name

  // Project assignment. Super admin has access to every project already
  // (has_project_access() short-circuits true for is_super_admin()), so
  // this only matters — and only shows — for every other role, per the
  // client's explicit requirement.
  const [projectsList, setProjectsList] = useState<{ id: string; project_name: string }[]>([]);
  const [assignedProjectIds, setAssignedProjectIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal open states
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'leads' | 'visits' | 'bookings' | 'attendance_tasks'>('overview');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  // One-time credential reveal after creating a new account — shown once,
  // never persisted or logged, so the admin must copy it now to hand off.
  const [newAccountCredentials, setNewAccountCredentials] = useState<{ email: string; password: string; syntheticEmail: boolean } | null>(null);

  // Employee details sub-resources states
  const [assignedLeads, setAssignedLeads] = useState<any[]>([]);
  const [assignedVisits, setAssignedVisits] = useState<any[]>([]);
  const [assignedBookings, setAssignedBookings] = useState<any[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Form Fields State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [gender, setGender] = useState('Male');
  const [dob, setDob] = useState('');
  const [mobile, setMobile] = useState('');
  const [alternateMobile, setAlternateMobile] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [employeeIdVal, setEmployeeIdVal] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [reportingManager, setReportingManager] = useState('');
  const [employmentType, setEmploymentType] = useState('Full Time');
  const [employmentStatus, setEmploymentStatus] = useState('active');
  const [officialEmail, setOfficialEmail] = useState('');
  const [workLocation, setWorkLocation] = useState('');
  const [branch, setBranch] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole | ''>('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [pincode, setPincode] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');

  // Fetch Lookups (Profiles, Roles, User Roles map, Managers Lookup)
  const fetchLookups = useCallback(async () => {
    try {
      const [profilesRes, rolesRes, userRolesRes, employeesLookupRes, projectsRes] = await Promise.all([
        supabase.from('user_profiles').select('id, full_name, email'),
        supabase.from('roles').select('id, name'),
        supabase.from('user_roles').select('user_id, role_id'),
        supabase.from('employees').select('id, first_name, last_name, designation'),
        supabase.from('projects').select('id, project_name').order('project_name')
      ]);

      if (profilesRes.data) setProfiles(profilesRes.data);
      if (rolesRes.data) setRolesList(rolesRes.data);
      if (projectsRes.data) setProjectsList(projectsRes.data);

      if (rolesRes.data && userRolesRes.data) {
        const roleMap = new Map(rolesRes.data.map(r => [r.id, r.name]));
        const uRoleMap = new Map<string, string>();
        userRolesRes.data.forEach(ur => {
          const rName = roleMap.get(ur.role_id);
          if (rName) uRoleMap.set(ur.user_id, rName);
        });
        setUserRolesMap(uRoleMap);
      }

      if (employeesLookupRes.data) {
        setManagersLookup(employeesLookupRes.data.map(e => ({
          id: e.id,
          name: `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Unnamed',
          designation: e.designation || 'No Designation'
        })));
      }
    } catch (err) {
      reportQueryError('Employees: lookups', err);
    }
  }, []);

  // Fetch Employees List
  const fetchEmployees = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      let query = supabase.from('employees').select('*', { count: 'exact' });

      // Apply in-memory search and filters later, or build query
      const fromVal = page * pageSize;
      const toVal = fromVal + pageSize - 1;
      query = query.range(fromVal, toVal).order('created_at', { ascending: false });

      const { data, count, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      setEmployees(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.error('Error fetching employees:', err);
      setError(err.message || 'An unexpected error occurred while loading employees.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    await fetchLookups();
    await fetchEmployees();
  };

  // Toast alert dismiss timer
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Load employee details sub-resources dynamically
  useEffect(() => {
    const fetchEmployeeDetailsData = async () => {
      if (!selectedEmployee) {
        setAssignedLeads([]);
        setAssignedVisits([]);
        setAssignedBookings([]);
        return;
      }

      setDetailsLoading(true);
      try {
        const uId = selectedEmployee.user_id;
        if (!uId) {
          setAssignedLeads([]);
          setAssignedVisits([]);
          setAssignedBookings([]);
          return;
        }

        const [leadsRes, visitsRes, bookingsRes] = await Promise.all([
          supabase.from('leads').select('id, lead_number, customer_name, status, created_at').eq('owner_id', uId),
          supabase.from('site_visits').select('id, scheduled_at, status, remarks, leads!inner(customer_name, owner_id)').eq('leads.owner_id', uId),
          supabase.from('bookings').select('id, booking_number, booking_amount, status, booking_date, leads!inner(customer_name, owner_id)').eq('leads.owner_id', uId)
        ]);

        setAssignedLeads(leadsRes.data || []);
        setAssignedVisits(visitsRes.data || []);
        setAssignedBookings(bookingsRes.data || []);
      } catch (err) {
        reportQueryError('Employees: sub-resources', err);
      } finally {
        setDetailsLoading(false);
      }
    };

    fetchEmployeeDetailsData();
    setActiveTab('overview');
  }, [selectedEmployee]);

  // Form Reset
  const resetForm = () => {
    setEditingId(null);
    setFirstName('');
    setLastName('');
    setProfilePhoto('');
    setGender('Male');
    setDob('');
    setMobile('');
    setAlternateMobile('');
    setPersonalEmail('');
    setEmployeeIdVal('');
    setJoiningDate('');
    setDepartment('');
    setDesignation('');
    setReportingManager('');
    setEmploymentType('Full Time');
    setEmploymentStatus('active');
    setOfficialEmail('');
    setWorkLocation('');
    setBranch('');
    setSelectedRole('');
    setAddress('');
    setCity('');
    setStateVal('');
    setPincode('');
    setEmergencyContactName('');
    setEmergencyContactPhone('');
    setNotes('');
    setSelectedUserId('');
    setAssignedProjectIds([]);
    setFormError(null);
  };

  // Open Form for Creating New Employee
  const openCreateModal = () => {
    resetForm();
    setIsEditMode(false);
    setIsFormOpen(true);
  };

  // Open Form for Editing Employee
  const openEditModal = (emp: Employee) => {
    resetForm();
    setIsEditMode(true);
    setEditingId(emp.id);
    setFirstName(emp.first_name || '');
    setLastName(emp.last_name || '');
    setProfilePhoto(emp.profile_photo || '');
    setGender(emp.gender || 'Male');
    setDob(emp.date_of_birth || '');
    setMobile(emp.mobile || '');
    setAlternateMobile(emp.alternate_mobile || '');
    setPersonalEmail(emp.personal_email || '');
    setEmployeeIdVal(emp.employee_id || '');
    setJoiningDate(emp.joining_date || '');
    setDepartment(emp.department || '');
    setDesignation(emp.designation || '');
    setReportingManager(emp.reporting_manager || '');
    setEmploymentType(emp.employment_type || 'Full Time');
    setEmploymentStatus(emp.employment_status || 'active');
    setOfficialEmail(emp.official_email || '');
    setWorkLocation(emp.work_location || '');
    setBranch(emp.branch || '');
    setAddress(emp.address || '');
    setCity(emp.city || '');
    setStateVal(emp.state || '');
    setPincode(emp.pincode || '');
    setEmergencyContactName(emp.emergency_contact_name || '');
    setEmergencyContactPhone(emp.emergency_contact_phone || '');
    setNotes(emp.notes || '');
    setSelectedUserId(emp.user_id || '');

    const rName = emp.user_id ? userRolesMap.get(emp.user_id) : '';
    setSelectedRole((rName as UserRole) || '');

    if (emp.user_id) {
      supabase.from('user_project_assignments').select('project_id').eq('user_id', emp.user_id).eq('is_active', true)
        .then(({ data, error }) => {
          if (error) reportQueryError('Employees: existing project assignments', error);
          else setAssignedProjectIds((data || []).map(r => r.project_id));
        });
    }

    setIsFormOpen(true);
  };

  // Submit Handler
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !mobile || !employeeIdVal || !joiningDate || !department || !designation) {
      setFormError('Please fill in all required fields.');
      return;
    }

    setFormError(null);
    setFormLoading(true);

    let finalUserId = selectedUserId;
    let tempCreatedProfileId = null;
    let createdCredentials: { email: string; password: string; syntheticEmail: boolean } | null = null;

    try {
      // 1. Transaction-safe check/insert for user_profiles if no profile is linked
      if (!finalUserId) {
        const isSyntheticEmail = !personalEmail && !officialEmail;
        const targetEmail = personalEmail || officialEmail || `${employeeIdVal.toLowerCase()}@estatecrm.internal`;

        // Check if profile already exists with this email
        const { data: existingProfile, error: checkError } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('email', targetEmail)
          .maybeSingle();

        if (checkError) throw checkError;

        if (existingProfile) {
          finalUserId = existingProfile.id;
        } else {
          // Register user in auth.users via an admin Edge Function rather
          // than the public supabase.auth.signUp() endpoint. signUp()
          // sends a confirmation email even though nothing here uses it,
          // and Supabase's built-in email sender caps out at a handful of
          // sends per hour on the free tier — confirmed live, onboarding
          // the 3rd+ employee in a short span failed with "email rate
          // limit exceeded". The Edge Function uses the service_role key
          // (never exposed to the browser) to call admin.createUser()
          // with email_confirm:true, which creates the account without
          // sending any email at all, so it has no rate-limit exposure.
          // It independently re-checks that the caller is a super_admin
          // server-side — this route restriction alone is not the real
          // security boundary.
          //
          // A random password per employee, not a hardcoded constant —
          // the previous version gave every auto-created account the
          // literal string 'TempPassword123!', visible in source control,
          // meaning anyone who knew (or guessed) an employee code could
          // log in as that employee.
          const generatedPassword = generateRandomPassword();

          // Resolve a *live* access token rather than relying on
          // functions.invoke's implicit auth. When the stored session has
          // expired (or its background refresh failed — e.g. the
          // navigator.locks contention this app has hit before),
          // functions.invoke silently falls back to sending the anon
          // publishable key as the Bearer token. The Edge Function gateway
          // accepts that key as valid, so the request gets through, but
          // the function then can't resolve a *user* from it and fails
          // with "Could not resolve caller identity" — a confusing 401
          // when the UI still shows you as logged in (React state is
          // stale, held in memory from before the token expired).
          // getSession() refreshes an expired token if it can; if it
          // can't, we say so plainly instead of emitting that 401.
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          if (!accessToken) {
            throw new Error('Your login session has expired. Please sign out and sign back in, then try again.');
          }

          const { data: fnData, error: fnError } = await supabase.functions.invoke('create-employee-account', {
            body: {
              email: targetEmail,
              password: generatedPassword,
              full_name: `${firstName} ${lastName || ''}`.trim(),
            },
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (fnError) {
            const detail = (fnError as any)?.context?.body ? await (fnError as any).context.text().catch(() => null) : null;
            throw new Error(`Failed to create Auth User: ${detail || fnError.message}`);
          }
          if (fnData?.error) {
            throw new Error(`Failed to create Auth User: ${fnData.error}`);
          }

          const newUserId = fnData?.id;
          if (!newUserId) {
            throw new Error('Auth User registration did not return a valid user ID.');
          }

          // The handle_new_user DB trigger fires on the auth.users insert
          // above and immediately creates a bare-bones user_profiles row
          // (id, email, full_name guessed from the email, no
          // must_change_password) — confirmed live: without this check,
          // the row this branch's own insert tries to create already
          // exists, the insert is skipped entirely, and the account never
          // gets flagged for a forced password change. Update the
          // trigger's row instead of assuming we need to create one.
          const { data: profileCheck } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('id', newUserId)
            .maybeSingle();

          if (!profileCheck) {
            const { error: createProfileError } = await supabase
              .from('user_profiles')
              .insert([{
                id: newUserId,
                email: targetEmail,
                full_name: `${firstName} ${lastName || ''}`.trim(),
                status: 'active',
                must_change_password: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }]);

            if (createProfileError) {
              throw new Error(`Failed to auto-create user profile: ${createProfileError.message}`);
            }

            tempCreatedProfileId = newUserId;
          } else {
            const { error: updateProfileError } = await supabase
              .from('user_profiles')
              .update({
                full_name: `${firstName} ${lastName || ''}`.trim(),
                status: 'active',
                must_change_password: true,
                updated_at: new Date().toISOString()
              })
              .eq('id', newUserId);

            if (updateProfileError) {
              throw new Error(`Failed to finish setting up the user profile: ${updateProfileError.message}`);
            }
          }

          finalUserId = newUserId;
          createdCredentials = { email: targetEmail, password: generatedPassword, syntheticEmail: isSyntheticEmail };
        }
      }

      // 2. Build complete mapped payload matching the Supabase columns checklist
      const payload = {
        user_id: finalUserId,
        employee_id: employeeIdVal,
        employee_code: employeeIdVal,
        first_name: firstName,
        last_name: lastName || null,
        designation: designation,
        department: department,
        joining_date: joiningDate,
        employment_status: employmentStatus,
        reporting_manager: reportingManager || null,
        emergency_contact_name: emergencyContactName || null,
        emergency_contact_mobile: emergencyContactPhone || null,
        emergency_contact_phone: emergencyContactPhone || null,
        work_location: workLocation || null,
        official_email: officialEmail || null,
        official_mobile: mobile,
        profile_photo: profilePhoto || null,
        gender: gender || null,
        date_of_birth: dob || null,
        mobile: mobile,
        alternate_mobile: alternateMobile || null,
        personal_email: personalEmail || null,
        employment_type: employmentType,
        branch: branch || null,
        address: address || null,
        city: city || null,
        state: stateVal || null,
        pincode: pincode || null,
        notes: notes || null,
        updated_at: new Date().toISOString()
      };

      if (isEditMode && editingId) {
        // Update Employee
        const { error: updateError } = await supabase
          .from('employees')
          .update(payload)
          .eq('id', editingId);
        if (updateError) throw updateError;
      } else {
        // Insert Employee
        const { error: insertError } = await supabase
          .from('employees')
          .insert([payload]);
        if (insertError) throw insertError;
      }

      // Sync Role with user_roles RBAC mapping
      if (finalUserId && selectedRole) {
        const matchedRole = rolesList.find(r => r.name === selectedRole);
        if (!matchedRole) {
          // Previously silently skipped if the name didn't match — the
          // dropdown is now sourced from this same rolesList, so this
          // should be unreachable, but surface it loudly rather than
          // silently leave someone with no access if it ever isn't.
          throw new Error(`Role "${selectedRole}" was not found in the roles table. The employee record was saved, but no access role was assigned — please assign one manually.`);
        }
        const { error: roleError } = await supabase.from('user_roles').upsert({
          user_id: finalUserId,
          role_id: matchedRole.id
        });
        if (roleError) {
          throw new Error(`Employee saved, but assigning the role failed: ${roleError.message}`);
        }

        // Project assignment — skipped for super_admin, who already has
        // access to every project's data (has_project_access() returns
        // true for them unconditionally). For every other role, this is
        // the actual access-control mechanism: has_project_access() reads
        // this table, so leads/bookings/inventory RLS across the app
        // start reflecting whatever is selected here as soon as this
        // save completes. Re-editable later — reopening Edit on this same
        // employee loads their current assignments and any change here
        // takes effect immediately for their NEXT query; a tab they
        // already have open still shows what it last fetched until they
        // reload or navigate, same as any other live data in this app.
        //
        // Delete-then-insert rather than upsert: user_project_assignments
        // has no single-column unique key .upsert() could target cleanly,
        // and this also correctly handles a project being unchecked
        // (removed) — upsert alone can only add/update rows, never remove
        // ones no longer selected.
        if (selectedRole !== 'super_admin') {
          const { error: deleteAssignErr } = await supabase
            .from('user_project_assignments')
            .delete()
            .eq('user_id', finalUserId);
          if (deleteAssignErr) {
            throw new Error(`Employee and role saved, but clearing old project assignments failed: ${deleteAssignErr.message}`);
          }

          if (assignedProjectIds.length > 0) {
            const { error: insertAssignErr } = await supabase
              .from('user_project_assignments')
              .insert(assignedProjectIds.map(projectId => ({
                user_id: finalUserId,
                project_id: projectId,
                role_id: matchedRole.id,
                is_active: true,
              })));
            if (insertAssignErr) {
              throw new Error(`Employee and role saved, but assigning projects failed: ${insertAssignErr.message}`);
            }
          }
        }
      }

      setIsFormOpen(false);
      resetForm();
      await fetchEmployees();
      await fetchLookups();

      if (createdCredentials) {
        // Show the one-time password reveal instead of the plain success
        // toast — this is the only moment the admin can see it.
        setNewAccountCredentials(createdCredentials);
      } else {
        setNotification({
          type: 'success',
          message: isEditMode ? 'Employee profile updated successfully!' : 'New employee registered successfully!'
        });
      }
    } catch (err: any) {
      console.error('Error saving employee:', err);
      // Rollback profile creation if employee creation failed
      if (tempCreatedProfileId) {
        try {
          await supabase.from('user_profiles').delete().eq('id', tempCreatedProfileId);
        } catch (cleanupErr) {
          reportQueryError('Employees: orphan profile cleanup', cleanupErr);
        }
      }
      setFormError(err.message || 'Database error occurred.');
    } finally {
      setFormLoading(false);
    }
  };

  // Toggle Activation Status
  const handleToggleActivation = async (emp: Employee) => {
    const nextStatus = emp.employment_status?.toLowerCase() === 'active' ? 'inactive' : 'active';
    try {
      const { error: updateError } = await supabase
        .from('employees')
        .update({ employment_status: nextStatus })
        .eq('id', emp.id);
      if (updateError) throw updateError;

      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, employment_status: nextStatus } : e));
      if (selectedEmployee && selectedEmployee.id === emp.id) {
        setSelectedEmployee(prev => prev ? { ...prev, employment_status: nextStatus } : null);
      }

      setNotification({
        type: 'success',
        message: `Employee status changed to ${nextStatus.toUpperCase()}!`
      });
    } catch (err: any) {
      console.error('Activation toggle error:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to update employee status.' });
    }
  };

  // Filter and Search calculations
  const getFilteredEmployees = () => {
    return employees.filter(emp => {
      const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase();
      const matchesSearch = searchQuery
        ? (fullName.includes(searchQuery.toLowerCase()) ||
           emp.employee_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           emp.official_email?.toLowerCase().includes(searchQuery.toLowerCase()))
        : true;

      const matchesDept = deptFilter ? emp.department === deptFilter : true;
      const matchesDesig = desigFilter ? emp.designation === desigFilter : true;
      const matchesStatus = statusFilter ? emp.employment_status === statusFilter : true;

      const userRole = emp.user_id ? userRolesMap.get(emp.user_id) : '';
      const matchesRole = roleFilter ? userRole === roleFilter : true;

      return matchesSearch && matchesDept && matchesDesig && matchesStatus && matchesRole;
    });
  };

  const filteredEmployees = getFilteredEmployees();

  // Dynamic Statistics
  const getStats = () => {
    let active = 0;
    let inactive = 0;
    let onLeave = 0;
    const depts = new Set<string>();

    employees.forEach(emp => {
      const status = emp.employment_status?.toLowerCase();
      if (status === 'active') active++;
      else if (status === 'inactive' || status === 'terminated') inactive++;
      else if (status === 'on_leave') onLeave++;

      if (emp.department) depts.add(emp.department);
    });

    return { total: employees.length, active, inactive, onLeave, departments: depts.size };
  };

  const stats = getStats();

  const startRange = page * pageSize + 1;
  const endRange = Math.min((page + 1) * pageSize, totalCount);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Employees Directory</h2>
          <p className="text-slate-500 text-sm">Manage staff records, work branches, emergency details, and RBAC mapping.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center space-x-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm focus:outline-none disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 text-slate-500 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync Data'}</span>
          </button>
          <button
            onClick={openCreateModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md shadow-indigo-650/10 hover:shadow-lg transition-all focus:outline-none"
          >
            + Add Employee
          </button>
        </div>
      </div>

      {/* Alerts toast */}
      {notification && (
        <div className={`border rounded-xl p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200 shadow-sm ${
          notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-955'
        }`}>
          <div className="flex items-center space-x-2.5">
            <CheckCircle className={`h-5 w-5 ${notification.type === 'success' ? 'text-emerald-600' : 'text-rose-605'}`} />
            <span className="text-sm font-semibold">{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600 focus:outline-none">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-4 flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-sm">Database Fetch Error</h4>
            <p className="text-xs text-rose-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* SUMMARY STATS */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Staff</p>
          <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{stats.total}</h3>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-emerald-700 text-[10px] font-bold uppercase tracking-wider">Active</p>
          <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">{stats.active}</h3>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Inactive</p>
          <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{stats.inactive}</h3>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-amber-700 text-[10px] font-bold uppercase tracking-wider">On Leave</p>
          <h3 className="text-2xl font-extrabold text-amber-600 mt-1">{stats.onLeave}</h3>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm col-span-2 lg:col-span-1">
          <p className="text-indigo-700 text-[10px] font-bold uppercase tracking-wider">Departments</p>
          <h3 className="text-2xl font-extrabold text-indigo-600 mt-1">{stats.departments}</h3>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Search */}
        <div className="relative lg:col-span-2">
          <Search className="absolute inset-y-0 left-3 h-4 w-4 text-slate-400 self-center top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, ID, email..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
          />
        </div>

        {/* Dept Filter */}
        <div>
          <select
            value={deptFilter}
            onChange={(e) => { setDeptFilter(e.target.value); setPage(0); }}
            className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
          >
            <option value="">All Departments</option>
            {Array.from(new Set(employees.map(e => e.department).filter(Boolean))).map(d => (
              <option key={d} value={d!}>{d}</option>
            ))}
          </select>
        </div>

        {/* Designation Filter */}
        <div>
          <select
            value={desigFilter}
            onChange={(e) => { setDesigFilter(e.target.value); setPage(0); }}
            className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
          >
            <option value="">All Designations</option>
            {Array.from(new Set(employees.map(e => e.designation).filter(Boolean))).map(d => (
              <option key={d} value={d!}>{d}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="on_leave">On Leave</option>
            <option value="resigned">Resigned</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>

        {/* Role Filter */}
        <div>
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}
            className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
          >
            <option value="">All Roles</option>
            {ROLES.map(r => (
              <option key={r} value={r}>{r.replace('_', ' ').toUpperCase()}</option>
            ))}
          </select>
        </div>
      </div>

      {/* TABLE DIRECTORY */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col">
        {loading ? (
          <div className="py-24 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-100 border-t-indigo-650 mx-auto mb-4"></div>
            <p className="text-slate-500 font-medium">Loading employees directory...</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-slate-800">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3.5 px-6">Employee ID & Photo</th>
                    <th className="py-3.5 px-6">Name & Email</th>
                    <th className="py-3.5 px-6">Department & Designation</th>
                    <th className="py-3.5 px-6">Reporting Manager</th>
                    <th className="py-3.5 px-6">Join Date</th>
                    <th className="py-3.5 px-6">Status</th>
                    <th className="py-3.5 px-6 text-indigo-700">Access Role</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmployees.length > 0 ? (
                    filteredEmployees.map((emp) => {
                      const userRoleVal = emp.user_id ? userRolesMap.get(emp.user_id) : '—';
                      const managerObj = managersLookup.find(m => m.id === emp.reporting_manager);
                      const managerName = managerObj ? managerObj.name : '—';

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-6">
                            <div className="flex items-center space-x-3">
                              {emp.profile_photo ? (
                                <img src={emp.profile_photo} alt="Avatar" className="h-10 w-10 rounded-full object-cover border border-slate-105" />
                              ) : (
                                <div className="h-10 w-10 rounded-full bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center text-sm border border-indigo-100">
                                  {emp.first_name?.[0]}{emp.last_name?.[0]}
                                </div>
                              )}
                              <span className="font-mono font-bold text-xs text-slate-600">{emp.employee_id || 'EMP-—'}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className="block font-semibold text-slate-905">{emp.first_name} {emp.last_name}</span>
                            <span className="block text-xs text-slate-400">{emp.official_email || emp.personal_email || 'No email'}</span>
                          </td>
                          <td className="py-4 px-6 text-sm text-slate-700">
                            <span className="block font-medium">{emp.designation || '—'}</span>
                            <span className="block text-xs text-slate-400">{emp.department || '—'}</span>
                          </td>
                          <td className="py-4 px-6 text-sm text-slate-700 font-medium">
                            {managerName}
                          </td>
                          <td className="py-4 px-6 text-sm text-slate-605 font-mono">
                            {emp.joining_date || '—'}
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${
                              emp.employment_status?.toLowerCase() === 'active' ? 'bg-emerald-50 text-emerald-700' :
                              emp.employment_status?.toLowerCase() === 'on_leave' ? 'bg-amber-50 text-amber-700' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {emp.employment_status || 'inactive'}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-sm font-semibold text-indigo-600 uppercase">
                            {userRoleVal}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => handleToggleActivation(emp)}
                                className={`p-1.5 rounded-lg border text-[10px] font-bold shadow-sm transition-all focus:outline-none ${
                                  emp.employment_status?.toLowerCase() === 'active'
                                    ? 'bg-rose-50 border-rose-100 text-rose-705 hover:bg-rose-100'
                                    : 'bg-emerald-50 border-emerald-100 text-emerald-705 hover:bg-emerald-100'
                                }`}
                                title={emp.employment_status?.toLowerCase() === 'active' ? 'Deactivate' : 'Reactivate'}
                              >
                                {emp.employment_status?.toLowerCase() === 'active' ? 'Deactivate' : 'Reactivate'}
                              </button>
                              <button
                                onClick={() => openEditModal(emp)}
                                className="p-1.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setSelectedEmployee(emp)}
                                className="p-1.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-20 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center space-y-3">
                          <Users className="h-8 w-8 text-slate-300" />
                          <p className="text-slate-505 font-semibold text-sm">No Employees Found</p>
                          <p className="text-xs max-w-sm text-slate-400">
                            There are currently no staff records registered in database matching settings.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalCount > 0 && (
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  Showing <span className="font-semibold text-slate-800">{startRange}</span> to{' '}
                  <span className="font-semibold text-slate-800">{endRange}</span> of{' '}
                  <span className="font-semibold text-slate-800">{totalCount}</span> employees
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPage(prev => Math.max(prev - 1, 0))}
                    disabled={page === 0}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus:outline-none disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4.5 w-4.5" />
                  </button>
                  <span className="text-xs font-semibold text-slate-750">
                    Page {page + 1} of {Math.ceil(totalCount / pageSize)}
                  </span>
                  <button
                    onClick={() => setPage(prev => prev + 1)}
                    disabled={(page + 1) * pageSize >= totalCount}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus:outline-none disabled:opacity-50"
                  >
                    <ChevronRight className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* DETAILS VIEW MODAL / PROFILE */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedEmployee(null)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-3xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Employee Profile Summary</span>
              <button onClick={() => setSelectedEmployee(null)} className="p-1 rounded-lg text-slate-400 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Profile Brief Area */}
            <div className="p-6 bg-slate-50 flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6 border-b border-slate-200">
              {selectedEmployee.profile_photo ? (
                <img src={selectedEmployee.profile_photo} alt="Profile" className="h-20 w-20 rounded-full object-cover border border-slate-200" />
              ) : (
                <div className="h-20 w-20 rounded-full bg-indigo-100 text-indigo-650 font-bold flex items-center justify-center text-3xl border border-indigo-200">
                  {selectedEmployee.first_name?.[0]}{selectedEmployee.last_name?.[0]}
                </div>
              )}
              <div className="text-center sm:text-left space-y-1.5">
                <h3 className="text-xl font-bold text-slate-900">{selectedEmployee.first_name} {selectedEmployee.last_name}</h3>
                <span className="inline-flex px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold uppercase tracking-wider">{selectedEmployee.designation || 'No Designation'}</span>
                <p className="text-xs text-slate-500 mt-1">Official ID: <span className="font-mono font-bold">{selectedEmployee.employee_id || '—'}</span> | Dept: <span className="font-semibold text-slate-700">{selectedEmployee.department || '—'}</span></p>
              </div>
            </div>

            {/* Profile Drawer Tabs */}
            <div className="border-b border-slate-250 bg-white flex space-x-4 px-6">
              {(['overview', 'leads', 'visits', 'bookings', 'attendance_tasks'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 focus:outline-none transition-all ${
                    activeTab === tab
                      ? 'border-indigo-600 text-indigo-650'
                      : 'border-transparent text-slate-450 hover:text-slate-700'
                  }`}
                >
                  {tab.replace('_', ' & ')}
                </button>
              ))}
            </div>

            {/* Modal Body with Tab Contents */}
            <div className="p-6 max-h-[50vh] overflow-y-auto min-h-[300px]">
              {detailsLoading ? (
                <div className="py-20 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-100 border-t-indigo-600 mx-auto mb-3"></div>
                  <p className="text-xs text-slate-400 font-medium">Fetching details log...</p>
                </div>
              ) : (
                <>
                  {/* OVERVIEW TAB */}
                  {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <h4 className="font-bold text-xs text-indigo-650 uppercase tracking-wider border-b border-slate-100 pb-1">Personal Details</h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Gender</span>
                            <span className="font-semibold text-slate-800">{selectedEmployee.gender || '—'}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">DOB</span>
                            <span className="font-semibold text-slate-800">{selectedEmployee.date_of_birth || '—'}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Personal Email</span>
                            <span className="font-semibold text-slate-800">{selectedEmployee.personal_email || '—'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-bold text-xs text-indigo-650 uppercase tracking-wider border-b border-slate-100 pb-1">Employment Details</h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Manager</span>
                            <span className="font-semibold text-slate-800">
                              {managersLookup.find(m => m.id === selectedEmployee.reporting_manager)?.name || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Type</span>
                            <span className="font-semibold text-slate-800">{selectedEmployee.employment_type || 'Full Time'}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Join Date</span>
                            <span className="font-semibold text-slate-800 font-mono">{selectedEmployee.joining_date || '—'}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Status</span>
                            <span className="font-semibold text-indigo-650 uppercase">{selectedEmployee.employment_status || 'active'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-bold text-xs text-indigo-650 uppercase tracking-wider border-b border-slate-100 pb-1">Contact & Address</h4>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Mobiles</span>
                            <span className="font-semibold text-slate-800">{selectedEmployee.mobile} {selectedEmployee.alternate_mobile ? ` / ${selectedEmployee.alternate_mobile}` : ''}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Location Address</span>
                            <p className="text-xs text-slate-600 leading-relaxed">
                              {selectedEmployee.address || '—'}<br />
                              {selectedEmployee.city ? `${selectedEmployee.city}, ` : ''}{selectedEmployee.state || ''} {selectedEmployee.pincode || ''}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-bold text-xs text-indigo-650 uppercase tracking-wider border-b border-slate-100 pb-1">Emergency contact & Notes</h4>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Emergency Contact</span>
                            <span className="font-semibold text-slate-800">{selectedEmployee.emergency_contact_name || '—'} ({selectedEmployee.emergency_contact_phone || '—'})</span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Notes</span>
                            <p className="text-xs text-slate-600 leading-relaxed italic">{selectedEmployee.notes || 'No profile notes added.'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* LEADS ASSIGNED TAB */}
                  {activeTab === 'leads' && (
                    <div className="space-y-3">
                      <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">Assigned Customer Leads ({assignedLeads.length})</h4>
                      {assignedLeads.length > 0 ? (
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-semibold uppercase">
                                <th className="py-2 px-4">Lead Number</th>
                                <th className="py-2 px-4">Customer Name</th>
                                <th className="py-2 px-4">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {assignedLeads.map(l => (
                                <tr key={l.id} className="hover:bg-slate-50/50">
                                  <td className="py-2 px-4 font-mono font-semibold text-indigo-650">{l.lead_number || 'LD-—'}</td>
                                  <td className="py-2 px-4 font-medium text-slate-900">{l.customer_name}</td>
                                  <td className="py-2 px-4 uppercase font-bold text-xxs text-slate-550">{l.status}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 italic py-6">No customer leads currently allocated to this employee profile.</p>
                      )}
                    </div>
                  )}

                  {/* SITE VISITS TAB */}
                  {activeTab === 'visits' && (
                    <div className="space-y-3">
                      <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">Site Visits Contribution ({assignedVisits.length})</h4>
                      {assignedVisits.length > 0 ? (
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-semibold uppercase">
                                <th className="py-2 px-4">Visit Date</th>
                                <th className="py-2 px-4">Customer Name</th>
                                <th className="py-2 px-4">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {assignedVisits.map(v => (
                                <tr key={v.id} className="hover:bg-slate-50/50">
                                  <td className="py-2 px-4 font-mono">{v.scheduled_at ? new Date(v.scheduled_at).toLocaleDateString('en-IN') : '—'}</td>
                                  <td className="py-2 px-4 font-medium text-slate-900">{v.leads?.customer_name || '—'}</td>
                                  <td className="py-2 px-4 uppercase font-bold text-xxs text-slate-550">{v.status}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 italic py-6">No scheduled site visit contributions on record.</p>
                      )}
                    </div>
                  )}

                  {/* BOOKINGS TAB */}
                  {activeTab === 'bookings' && (
                    <div className="space-y-3">
                      <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">Bookings & Sales Deals ({assignedBookings.length})</h4>
                      {assignedBookings.length > 0 ? (
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-semibold uppercase">
                                <th className="py-2 px-4">Booking ID</th>
                                <th className="py-2 px-4">Customer Name</th>
                                <th className="py-2 px-4">Sales Amount</th>
                                <th className="py-2 px-4">Date</th>
                                <th className="py-2 px-4">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {assignedBookings.map(b => (
                                <tr key={b.id} className="hover:bg-slate-50/50">
                                  <td className="py-2 px-4 font-mono font-semibold text-indigo-650">{b.booking_number || 'BK-—'}</td>
                                  <td className="py-2 px-4 font-medium text-slate-900">{b.leads?.customer_name || '—'}</td>
                                  <td className="py-2 px-4 font-semibold text-slate-800">₹{(Number(b.booking_amount) || 0).toLocaleString('en-IN')}</td>
                                  <td className="py-2 px-4 font-mono text-xxs">{b.booking_date || '—'}</td>
                                  <td className="py-2 px-4 uppercase font-bold text-xxs text-slate-550">{b.status}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 italic py-6">No booking agreements mapped to this employee profile.</p>
                      )}
                    </div>
                  )}

                  {/* ATTENDANCE & TASKS TAB */}
                  {activeTab === 'attendance_tasks' && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-1">Attendance logs</h4>
                        <p className="text-xs text-slate-500 italic">Attendance logs and biometric logs are handled under the Attendance module and will sync automatically.</p>
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-1">Task List</h4>
                        <p className="text-xs text-slate-500 italic">No tasks currently pending assignment on this employee card.</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
              <button
                onClick={() => setSelectedEmployee(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold focus:outline-none"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT EMPLOYEE FORM MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsFormOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left">
            <div className="bg-indigo-650 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">{isEditMode ? 'Edit Employee Details' : 'Register New Employee'}</span>
              <button type="button" onClick={() => setIsFormOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                {formError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-medium leading-tight">{formError}</span>
                  </div>
                )}

                {/* PERSONAL INFORMATION */}
                <div className="space-y-4">
                  <h4 className="font-bold text-xs text-indigo-650 uppercase tracking-wider border-b border-slate-100 pb-1.5">Personal Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">First Name *</label>
                      <input
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Last Name</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Mobile Number *</label>
                      <input
                        type="tel"
                        required
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Alternate Mobile</label>
                      <input
                        type="tel"
                        value={alternateMobile}
                        onChange={(e) => setAlternateMobile(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Gender</label>
                      <select
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Date of Birth</label>
                      <input
                        type="date"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Personal Email</label>
                      <input
                        type="email"
                        value={personalEmail}
                        onChange={(e) => setPersonalEmail(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-655 focus:outline-none transition-all"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Avatar / Profile Photo URL</label>
                      <input
                        type="url"
                        placeholder="https://example.com/avatar.jpg"
                        value={profilePhoto}
                        onChange={(e) => setProfilePhoto(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* EMPLOYMENT INFORMATION */}
                <div className="space-y-4">
                  <h4 className="font-bold text-xs text-indigo-655 uppercase tracking-wider border-b border-slate-100 pb-1.5">Employment Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Employee ID Code *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. EMP-0042"
                        value={employeeIdVal}
                        onChange={(e) => setEmployeeIdVal(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Joining Date *</label>
                      <input
                        type="date"
                        required
                        value={joiningDate}
                        onChange={(e) => setJoiningDate(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Department Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Sales, Pre-Sales"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Designation / Role Title *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Sourcing Manager"
                        value={designation}
                        onChange={(e) => setDesignation(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-655 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Reporting Manager</label>
                      <select
                        value={reportingManager}
                        onChange={(e) => setReportingManager(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="">No Reporting Manager...</option>
                        {managersLookup.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.designation})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Employment Type</label>
                      <select
                        value={employmentType}
                        onChange={(e) => setEmploymentType(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="Full Time">Full Time</option>
                        <option value="Part Time">Part Time</option>
                        <option value="Contract">Contract</option>
                        <option value="Intern">Intern</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Employment Status</label>
                      <select
                        value={employmentStatus}
                        onChange={(e) => setEmploymentStatus(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="on_leave">On Leave</option>
                        <option value="resigned">Resigned</option>
                        <option value="terminated">Terminated</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* WORK INFORMATION */}
                <div className="space-y-4">
                  <h4 className="font-bold text-xs text-indigo-650 uppercase tracking-wider border-b border-slate-100 pb-1.5">Work & RBAC Mapping</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Official Email Address</label>
                      <input
                        type="email"
                        value={officialEmail}
                        onChange={(e) => setOfficialEmail(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Work Location</label>
                      <input
                        type="text"
                        placeholder="e.g. Corporate Office"
                        value={workLocation}
                        onChange={(e) => setWorkLocation(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-655 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Branch Office</label>
                      <input
                        type="text"
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Link Auth User Profile</label>
                      <select
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="">No Linked Auth Profile...</option>
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Access Role Assignment</label>
                      <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="">No Role Assigned...</option>
                        {/* Sourced from the live `roles` table (rolesList), not the
                            hardcoded ROLES constant — that array has to be manually
                            kept in sync with the database and silently drops the role
                            assignment if a name here doesn't exist there. */}
                        {rolesList.map(r => (
                          <option key={r.id} value={r.name}>{r.name.replace(/_/g, ' ').toUpperCase()}</option>
                        ))}
                      </select>
                    </div>

                    {/* Project Assignment — super_admin already has access
                        to every project's data (has_project_access() short
                        -circuits true for them), so this only appears, and
                        only matters, for every other role. Whichever
                        projects are checked here become the only project
                        data this employee's account can see. */}
                    {selectedRole && selectedRole !== 'super_admin' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                          Assigned Project(s) <span className="text-slate-400 normal-case font-normal">— data access is limited to these</span>
                        </label>
                        <div className="border border-slate-200 rounded-xl bg-slate-50 p-3 space-y-1.5 max-h-40 overflow-y-auto">
                          {projectsList.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">No projects found.</p>
                          ) : (
                            projectsList.map(p => (
                              <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={assignedProjectIds.includes(p.id)}
                                  onChange={(e) => {
                                    setAssignedProjectIds(prev =>
                                      e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id)
                                    );
                                  }}
                                />
                                {p.project_name}
                              </label>
                            ))
                          )}
                        </div>
                        {assignedProjectIds.length === 0 && (
                          <p className="text-[10px] text-amber-600 mt-1">No project selected — this employee won't see any project-scoped data until at least one is assigned.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ADDRESS SECTION */}
                <div className="space-y-4">
                  <h4 className="font-bold text-xs text-indigo-650 uppercase tracking-wider border-b border-slate-100 pb-1.5">Address Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Address line</label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">City</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-655 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">State</label>
                      <input
                        type="text"
                        value={stateVal}
                        onChange={(e) => setStateVal(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Pincode</label>
                      <input
                        type="text"
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* EMERGENCY & NOTES */}
                <div className="space-y-4">
                  <h4 className="font-bold text-xs text-indigo-650 uppercase tracking-wider border-b border-slate-100 pb-1.5">Emergency contact & Notes</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Emergency Contact Name</label>
                      <input
                        type="text"
                        value={emergencyContactName}
                        onChange={(e) => setEmergencyContactName(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Emergency Contact Phone</label>
                      <input
                        type="tel"
                        value={emergencyContactPhone}
                        onChange={(e) => setEmergencyContactPhone(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Additional Profile Notes</label>
                      <textarea
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-650 focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Footer */}
              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg disabled:opacity-50 transition-all focus:outline-none"
                >
                  {formLoading ? 'Saving...' : 'Save Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {newAccountCredentials && (
        <div className="fixed inset-0 z-[60] overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-emerald-600 text-white px-6 py-4">
              <span className="font-bold tracking-tight">Account Created — Save This Now</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs">
                This password is shown <strong>once</strong> and cannot be retrieved again. Copy it and hand it to the
                employee now (WhatsApp, in person, etc). They'll be required to set their own password on first login.
              </div>
              {newAccountCredentials.syntheticEmail && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-xs">
                  No real email was provided, so a placeholder login (<code>{newAccountCredentials.email}</code>) was used.
                  <strong> Forgot-password / email reset will not work for this account</strong> since it isn't a real
                  inbox. Add a real email to the employee record if they'll need self-service password reset.
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Login Email</label>
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 break-all">
                  {newAccountCredentials.email}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Temporary Password</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800">
                    {newAccountCredentials.password}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(`Email: ${newAccountCredentials.email}\nPassword: ${newAccountCredentials.password}`)}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex-shrink-0"
                  >
                    Copy Both
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
              <button
                onClick={() => setNewAccountCredentials(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm"
              >
                I've Saved This — Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
