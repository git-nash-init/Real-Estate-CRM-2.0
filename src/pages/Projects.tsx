import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { canManageProjects, canCreateProject, canBulkAddUnits, isSuperAdmin } from '../utils/permissions';
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  X,
  AlertCircle,
  CheckCircle,
  Home,
  Layers,
  MapPin,
  Globe,
  ArrowLeft,
  Settings
} from 'lucide-react';

// Interfaces mapping database columns
interface Project {
  id: string;
  created_at: string;
  project_name: string;
  project_code: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  possession_date: string | null;
  status: string;
  description: string | null;
}

interface Tower {
  id: string;
  project_id: string;
  tower_name: string;
  tower_code: string | null;
  total_floors: number | null;
  total_units: number | null;
  status: string | null;
  created_at?: string;
}

interface InventoryUnit {
  id: string;
  project_id: string;
  tower_id: string;
  unit_number: string;
  configuration: string | null;
  carpet_area: number | null;
  built_up_area: number | null;
  facing: string | null;
  base_price: number | null;
  status: string;
  created_at?: string;
}

interface Booking {
  id: string;
  created_at: string;
  lead_id: string | null;
  project_id: string | null;
  booking_amount: number | null;
  status: string | null;
  booking_date: string | null;
  inventory_id: string | null;
}

// Helpers for serializing/deserializing UI metadata (Developer, RERA, website, maps_url) inside the description column
interface ProjectDescriptionJSON {
  developer: string;
  rera: string;
  website: string;
  maps_url: string;
  text: string;
}

const parseDescription = (descStr: string | null): ProjectDescriptionJSON => {
  if (!descStr) {
    return { developer: '', rera: '', website: '', maps_url: '', text: '' };
  }
  try {
    const trimmed = descStr.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed);
      return {
        developer: parsed.developer || '',
        rera: parsed.rera || '',
        website: parsed.website || '',
        maps_url: parsed.maps_url || '',
        text: parsed.text || ''
      };
    }
  } catch (err) {
    // Plain text fallback
  }
  return { developer: '', rera: '', website: '', maps_url: '', text: descStr };
};

const serializeDescription = (developer: string, rera: string, website: string, maps_url: string, text: string): string => {
  return JSON.stringify({ developer, rera, website, maps_url, text });
};

export const Projects: React.FC = () => {
  const { role } = useAuth();
  // Navigation & View Mode
  // 'list' or 'details'
  const [viewMode, setViewMode] = useState<'list' | 'details'>('list');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'towers' | 'inventory' | 'bookings' | 'payment milestones'>('overview');

  // Payment Milestones -- percentage tranches of the Agreement Value a
  // super admin releases for this project (see src/utils/bookingDue.ts).
  // Adding one immediately makes that much more of every booking's
  // Agreement Value due, across every booking in this project.
  const [milestones, setMilestones] = useState<{ id: string; percentage: number; label: string | null; created_at: string }[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState(false);
  const [newMilestonePercent, setNewMilestonePercent] = useState('');
  const [newMilestoneLabel, setNewMilestoneLabel] = useState('');
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const [milestoneSubmitting, setMilestoneSubmitting] = useState(false);

  const fetchMilestones = useCallback(async (projectId: string) => {
    setMilestonesLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_payment_milestones')
        .select('id, percentage, label, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMilestones(data || []);
    } catch (err: any) {
      console.error('Failed to load payment milestones:', err.message);
    } finally {
      setMilestonesLoading(false);
    }
  }, []);

  const handleAddMilestone = async () => {
    if (!selectedProjectId) return;
    const pct = parseFloat(newMilestonePercent);
    if (!pct || pct <= 0 || pct > 100) {
      setMilestoneError('Enter a percentage between 1 and 100.');
      return;
    }
    const currentTotal = milestones.reduce((sum, m) => sum + m.percentage, 0);
    if (currentTotal + pct > 100) {
      setMilestoneError(`This would bring the total released to ${(currentTotal + pct).toFixed(2)}%, over 100%. Only ${(100 - currentTotal).toFixed(2)}% remains.`);
      return;
    }
    setMilestoneError(null);
    setMilestoneSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('project_payment_milestones').insert([{
        project_id: selectedProjectId,
        percentage: pct,
        label: newMilestoneLabel.trim() || null,
        created_by: user?.id || null,
      }]);
      if (error) throw error;
      setNewMilestonePercent('');
      setNewMilestoneLabel('');
      await fetchMilestones(selectedProjectId);
    } catch (err: any) {
      setMilestoneError(err.message || 'Failed to add milestone.');
    } finally {
      setMilestoneSubmitting(false);
    }
  };

  const handleDeleteMilestone = async (milestoneId: string) => {
    if (!selectedProjectId) return;
    if (!window.confirm('Remove this payment milestone? This reduces the currently-due amount on every booking in this project.')) return;
    try {
      const { error } = await supabase.from('project_payment_milestones').delete().eq('id', milestoneId);
      if (error) throw error;
      await fetchMilestones(selectedProjectId);
    } catch (err: any) {
      setMilestoneError(err.message || 'Failed to remove milestone.');
    }
  };

  useEffect(() => {
    if (activeTab === 'payment milestones' && selectedProjectId) {
      fetchMilestones(selectedProjectId);
    }
  }, [activeTab, selectedProjectId, fetchMilestones]);

  // Master Lists
  const [projects, setProjects] = useState<Project[]>([]);
  const [towers, setTowers] = useState<Tower[]>([]);
  const [inventory, setInventory] = useState<InventoryUnit[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [leadsMap, setLeadsMap] = useState<Map<string, string>>(new Map());

  // Filter / Search states (Project Directory)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');

  // Table Pagination
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);

  // Loaders & Errors
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // MODALS
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectSubmitting, setProjectSubmitting] = useState(false);

  const [isTowerModalOpen, setIsTowerModalOpen] = useState(false);
  const [editingTower, setEditingTower] = useState<Tower | null>(null);
  const [towerError, setTowerError] = useState<string | null>(null);
  const [towerSubmitting, setTowerSubmitting] = useState(false);

  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<InventoryUnit | null>(null);
  const [unitError, setUnitError] = useState<string | null>(null);
  const [unitSubmitting, setUnitSubmitting] = useState(false);

  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkTowerId, setBulkTowerId] = useState('');
  const [bulkFloorFrom, setBulkFloorFrom] = useState('1');
  const [bulkFloorTo, setBulkFloorTo] = useState('10');
  const [bulkUnitsPerFloor, setBulkUnitsPerFloor] = useState('4');
  const [bulkConfig, setBulkConfig] = useState('1 BHK');
  const [bulkCarpet, setBulkCarpet] = useState('450');
  const [bulkBuiltUp, setBulkBuiltUp] = useState('600');
  const [bulkFacing, setBulkFacing] = useState('East');
  const [bulkPrice, setBulkPrice] = useState('4500000');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Project Form Fields
  const [pName, setPName] = useState('');
  const [pCode, setPCode] = useState('');
  const [pDev, setPDev] = useState('');
  const [pLocAddress, setPLocAddress] = useState('');
  const [pLocCity, setPLocCity] = useState('');
  const [pLocState, setPLocState] = useState('');
  const [pLocPincode, setPLocPincode] = useState('');
  const [pStatus, setPStatus] = useState('active');
  const [pRera, setPRera] = useState('');
  const [pPossession, setPPossession] = useState('');
  const [pWebsite, setPWebsite] = useState('');
  const [pMapsUrl, setPMapsUrl] = useState('');
  const [pDescText, setPDescText] = useState('');

  // Tower Form Fields
  const [tName, setTName] = useState('');
  const [tCode, setTCode] = useState('');
  const [tFloors, setTFloors] = useState('');
  const [tUnits, setTUnits] = useState('');
  const [tStatus, setTStatus] = useState('active');

  // Unit Form Fields
  const [uNumber, setUNumber] = useState('');
  const [uTowerId, setUTowerId] = useState('');
  const [uConfig, setUConfig] = useState('1 BHK');
  const [uCarpet, setUCarpet] = useState('');
  const [uBuiltUp, setUBuiltUp] = useState('');
  const [uFacing, setUFacing] = useState('East');
  const [uPrice, setUPrice] = useState('');
  const [uStatus, setUStatus] = useState('available');

  // Fetch all databases
  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [projectsRes, towersRes, inventoryRes, bookingsRes, leadsRes] = await Promise.all([
        supabase.from('projects').select('*'),
        supabase.from('project_towers').select('*'),
        supabase.from('project_inventory').select('*'),
        supabase.from('bookings').select('*'),
        supabase.from('leads').select('id, customer_name')
      ]);

      if (projectsRes.error) throw new Error(projectsRes.error.message);
      if (towersRes.error) throw new Error(towersRes.error.message);
      if (inventoryRes.error) throw new Error(inventoryRes.error.message);
      if (bookingsRes.error) throw new Error(bookingsRes.error.message);

      setProjects(projectsRes.data || []);
      setTowers(towersRes.data || []);
      setInventory(inventoryRes.data || []);
      setBookings(bookingsRes.data || []);

      if (leadsRes.data) {
        setLeadsMap(new Map(leadsRes.data.map(l => [l.id, l.customer_name || 'Unnamed Lead'])));
      }
    } catch (err: any) {
      console.error('Projects fetchData error:', err);
      setError(err.message || 'Failed to fetch project master data.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sync data manually
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    await fetchData();
  };

  // Toast helper
  useEffect(() => {
    if (notification) {
      const t = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(t);
    }
  }, [notification]);

  // Project Actions
  const openNewProject = () => {
    setEditingProject(null);
    setPName('');
    setPCode('');
    setPDev('');
    setPLocAddress('');
    setPLocCity('');
    setPLocState('');
    setPLocPincode('');
    setPStatus('active');
    setPRera('');
    setPPossession('');
    setPWebsite('');
    setPMapsUrl('');
    setPDescText('');
    setProjectError(null);
    setIsProjectModalOpen(true);
  };

  const openEditProject = (proj: Project) => {
    setEditingProject(proj);
    const parsed = parseDescription(proj.description);
    setPName(proj.project_name);
    setPCode(proj.project_code);
    setPDev(parsed.developer);
    setPLocAddress(proj.address || '');
    setPLocCity(proj.city || '');
    setPLocState(proj.state || '');
    setPLocPincode(proj.pincode || '');
    setPStatus(proj.status);
    setPRera(parsed.rera);
    setPPossession(proj.possession_date ? proj.possession_date.split('T')[0] : '');
    setPWebsite(parsed.website);
    setPMapsUrl(parsed.maps_url);
    setPDescText(parsed.text);
    setProjectError(null);
    setIsProjectModalOpen(true);
  };

  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim()) {
      setProjectError('Project Name is required.');
      return;
    }
    if (!pCode.trim()) {
      setProjectError('Project Code is required.');
      return;
    }

    // Check duplicate project name / code
    const isDuplicate = projects.some(p => 
      p.id !== editingProject?.id &&
      (p.project_name.toLowerCase() === pName.trim().toLowerCase() ||
       p.project_code.toLowerCase() === pCode.trim().toLowerCase())
    );
    if (isDuplicate) {
      setProjectError('A project with this Name or Code already exists.');
      return;
    }

    setProjectError(null);
    setProjectSubmitting(true);

    const serializedDesc = serializeDescription(pDev.trim(), pRera.trim(), pWebsite.trim(), pMapsUrl.trim(), pDescText.trim());
    const payload = {
      project_name: pName.trim(),
      project_code: pCode.trim(),
      address: pLocAddress.trim() || null,
      city: pLocCity.trim() || null,
      state: pLocState.trim() || null,
      pincode: pLocPincode.trim() || null,
      possession_date: pPossession ? new Date(pPossession).toISOString() : null,
      status: pStatus,
      description: serializedDesc
    };

    try {
      if (editingProject) {
        const { error: editErr } = await supabase
          .from('projects')
          .update(payload)
          .eq('id', editingProject.id);
        if (editErr) throw new Error(editErr.message);

        setNotification({ type: 'success', message: 'Project details updated successfully.' });
      } else {
        const { error: addErr } = await supabase
          .from('projects')
          .insert([payload]);
        if (addErr) throw new Error(addErr.message);

        setNotification({ type: 'success', message: 'Project created successfully.' });
      }

      setIsProjectModalOpen(false);
      await fetchData();
    } catch (err: any) {
      console.error('Project save error:', err);
      setProjectError(err.message || 'Database error occurred while saving project.');
    } finally {
      setProjectSubmitting(false);
    }
  };

  const handleDeleteProject = async (projId: string) => {
    const projectTowers = towers.filter(t => t.project_id === projId);
    const projectInventory = inventory.filter(i => i.project_id === projId);
    const projectBookings = bookings.filter(b => b.project_id === projId);

    if (projectTowers.length > 0 || projectInventory.length > 0 || projectBookings.length > 0) {
      setNotification({
        type: 'error',
        message: 'This project cannot be deleted because related records (Towers/Inventory/Bookings) exist.'
      });
      return;
    }

    if (!window.confirm('Are you sure you want to delete this project? This action is irreversible.')) {
      return;
    }

    try {
      const { error: delErr } = await supabase
        .from('projects')
        .delete()
        .eq('id', projId);
      if (delErr) throw new Error(delErr.message);

      setNotification({ type: 'success', message: 'Project deleted successfully.' });
      await fetchData();
    } catch (err: any) {
      console.error('Delete project error:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to delete project.' });
    }
  };

  // Tower Actions
  const openNewTower = () => {
    setEditingTower(null);
    setTName('');
    setTCode('');
    setTFloors('');
    setTUnits('');
    setTStatus('active');
    setTowerError(null);
    setIsTowerModalOpen(true);
  };

  const openEditTower = (tow: Tower) => {
    setEditingTower(tow);
    setTName(tow.tower_name);
    setTCode(tow.tower_code || '');
    setTFloors(tow.total_floors ? String(tow.total_floors) : '');
    setTUnits(tow.total_units ? String(tow.total_units) : '');
    setTStatus(tow.status || 'active');
    setTowerError(null);
    setIsTowerModalOpen(true);
  };

  const handleTowerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) return;
    if (!tName.trim()) {
      setTowerError('Tower Name is required.');
      return;
    }

    // Check duplicate tower within project
    const isDuplicate = towers.some(t => 
      t.project_id === selectedProjectId &&
      t.id !== editingTower?.id &&
      t.tower_name.toLowerCase() === tName.trim().toLowerCase()
    );
    if (isDuplicate) {
      setTowerError('A tower with this name already exists in this project.');
      return;
    }

    setTowerError(null);
    setTowerSubmitting(true);

    const payload = {
      project_id: selectedProjectId,
      tower_name: tName.trim(),
      tower_code: tCode.trim() || null,
      total_floors: tFloors ? parseInt(tFloors) : null,
      total_units: tUnits ? parseInt(tUnits) : null,
      status: tStatus
    };

    try {
      if (editingTower) {
        const { error: editErr } = await supabase
          .from('project_towers')
          .update(payload)
          .eq('id', editingTower.id);
        if (editErr) throw new Error(editErr.message);

        setNotification({ type: 'success', message: 'Tower details updated successfully.' });
      } else {
        const { error: addErr } = await supabase
          .from('project_towers')
          .insert([payload]);
        if (addErr) throw new Error(addErr.message);

        setNotification({ type: 'success', message: 'Tower created successfully.' });
      }

      setIsTowerModalOpen(false);
      await fetchData();
    } catch (err: any) {
      console.error('Tower save error:', err);
      setTowerError(err.message || 'Database error occurred while saving tower.');
    } finally {
      setTowerSubmitting(false);
    }
  };

  const handleDeleteTower = async (towId: string) => {
    const towerUnits = inventory.filter(i => i.tower_id === towId);
    const towerBookings = bookings.filter(b => b.inventory_id && towerUnits.some(u => u.id === b.inventory_id));

    if (towerUnits.length > 0 || towerBookings.length > 0) {
      setNotification({
        type: 'error',
        message: 'This tower cannot be deleted because related inventory units or bookings exist.'
      });
      return;
    }

    if (!window.confirm('Are you sure you want to delete this tower?')) {
      return;
    }

    try {
      const { error: delErr } = await supabase
        .from('project_towers')
        .delete()
        .eq('id', towId);
      if (delErr) throw new Error(delErr.message);

      setNotification({ type: 'success', message: 'Tower deleted successfully.' });
      await fetchData();
    } catch (err: any) {
      console.error('Delete tower error:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to delete tower.' });
    }
  };

  // Single Unit Actions
  const openNewUnit = () => {
    setEditingUnit(null);
    setUNumber('');
    // Defaults to first tower if available
    const projectTows = towers.filter(t => t.project_id === selectedProjectId);
    setUTowerId(projectTows[0]?.id || '');
    setUConfig('1 BHK');
    setUCarpet('');
    setUBuiltUp('');
    setUFacing('East');
    setUPrice('');
    setUStatus('available');
    setUnitError(null);
    setIsUnitModalOpen(true);
  };

  const openEditUnit = (unit: InventoryUnit) => {
    setEditingUnit(unit);
    setUNumber(unit.unit_number);
    setUTowerId(unit.tower_id);
    setUConfig(unit.configuration || '1 BHK');
    setUCarpet(unit.carpet_area ? String(unit.carpet_area) : '');
    setUBuiltUp(unit.built_up_area ? String(unit.built_up_area) : '');
    setUFacing(unit.facing || 'East');
    setUPrice(unit.base_price ? String(unit.base_price) : '');
    setUStatus(unit.status);
    setUnitError(null);
    setIsUnitModalOpen(true);
  };

  const handleUnitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) return;
    if (!uNumber.trim()) {
      setUnitError('Unit Number is required.');
      return;
    }
    if (!uTowerId) {
      setUnitError('Please select a Tower.');
      return;
    }

    // Check duplicate unit within project & tower
    const isDuplicate = inventory.some(i => 
      i.project_id === selectedProjectId &&
      i.tower_id === uTowerId &&
      i.id !== editingUnit?.id &&
      i.unit_number.toLowerCase() === uNumber.trim().toLowerCase()
    );
    if (isDuplicate) {
      setUnitError('A unit with this number already exists in this tower.');
      return;
    }

    setUnitError(null);
    setUnitSubmitting(true);

    const payload = {
      project_id: selectedProjectId,
      tower_id: uTowerId,
      unit_number: uNumber.trim(),
      configuration: uConfig || null,
      carpet_area: uCarpet ? parseFloat(uCarpet) : null,
      built_up_area: uBuiltUp ? parseFloat(uBuiltUp) : null,
      facing: uFacing || null,
      base_price: uPrice ? parseFloat(uPrice) : null,
      status: uStatus
    };

    try {
      if (editingUnit) {
        const { error: editErr } = await supabase
          .from('project_inventory')
          .update(payload)
          .eq('id', editingUnit.id);
        if (editErr) throw new Error(editErr.message);

        setNotification({ type: 'success', message: 'Unit details updated successfully.' });
      } else {
        const { error: addErr } = await supabase
          .from('project_inventory')
          .insert([payload]);
        if (addErr) throw new Error(addErr.message);

        setNotification({ type: 'success', message: 'Unit created successfully.' });
      }

      setIsUnitModalOpen(false);
      await fetchData();
    } catch (err: any) {
      console.error('Unit save error:', err);
      setUnitError(err.message || 'Database error occurred while saving unit.');
    } finally {
      setUnitSubmitting(false);
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    const unitBookings = bookings.filter(b => b.inventory_id === unitId);
    if (unitBookings.length > 0) {
      setNotification({
        type: 'error',
        message: 'This unit cannot be deleted because related client bookings depend on it.'
      });
      return;
    }

    if (!window.confirm('Are you sure you want to delete this unit?')) {
      return;
    }

    try {
      const { error: delErr } = await supabase
        .from('project_inventory')
        .delete()
        .eq('id', unitId);
      if (delErr) throw new Error(delErr.message);

      setNotification({ type: 'success', message: 'Unit deleted successfully.' });
      await fetchData();
    } catch (err: any) {
      console.error('Delete unit error:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to delete unit.' });
    }
  };

  // Bulk Units Generation
  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) return;
    if (!bulkTowerId) {
      setBulkError('Please select a Tower.');
      return;
    }

    const fFrom = parseInt(bulkFloorFrom);
    const fTo = parseInt(bulkFloorTo);
    const uPerFloor = parseInt(bulkUnitsPerFloor);

    if (isNaN(fFrom) || isNaN(fTo) || fFrom <= 0 || fTo < fFrom) {
      setBulkError('Please enter a valid Floor range.');
      return;
    }
    if (isNaN(uPerFloor) || uPerFloor <= 0 || uPerFloor > 20) {
      setBulkError('Units per floor must be between 1 and 20.');
      return;
    }

    setBulkError(null);
    setBulkSubmitting(true);

    try {
      // Find matching tower name to generate a prefix letter if applicable (e.g. Tower A -> "A-")
      const towerRecord = towers.find(t => t.id === bulkTowerId);
      const towerPrefix = towerRecord?.tower_name?.replace(/Tower\s+/gi, '').trim().substring(0, 2) || 'U';

      const unitsToInsert: any[] = [];
      let duplicateCount = 0;

      for (let floor = fFrom; floor <= fTo; floor++) {
        for (let idx = 1; idx <= uPerFloor; idx++) {
          // Format unit number (e.g. A-101, A-102, A-201, A-202)
          const formattedIndex = String(idx).padStart(2, '0');
          const unitNo = `${towerPrefix}-${floor}${formattedIndex}`;

          // Check if already exists in database list
          const exists = inventory.some(i => 
            i.project_id === selectedProjectId &&
            i.tower_id === bulkTowerId &&
            i.unit_number.toLowerCase() === unitNo.toLowerCase()
          );

          if (exists) {
            duplicateCount++;
          } else {
            unitsToInsert.push({
              project_id: selectedProjectId,
              tower_id: bulkTowerId,
              unit_number: unitNo,
              configuration: bulkConfig || null,
              carpet_area: bulkCarpet ? parseFloat(bulkCarpet) : null,
              built_up_area: bulkBuiltUp ? parseFloat(bulkBuiltUp) : null,
              facing: bulkFacing || null,
              base_price: bulkPrice ? parseFloat(bulkPrice) : null,
              status: 'available'
            });
          }
        }
      }

      if (unitsToInsert.length === 0) {
        setBulkError(`No new units were created. All ${duplicateCount} generated units already exist.`);
        setBulkSubmitting(false);
        return;
      }

      const { error: bulkInsertErr } = await supabase
        .from('project_inventory')
        .insert(unitsToInsert);

      if (bulkInsertErr) throw new Error(bulkInsertErr.message);

      setNotification({
        type: 'success',
        message: `Successfully generated ${unitsToInsert.length} units!${
          duplicateCount > 0 ? ` (${duplicateCount} duplicate units skipped).` : ''
        }`
      });

      setIsBulkModalOpen(false);
      await fetchData();
    } catch (err: any) {
      console.error('Bulk insert error:', err);
      setBulkError(err.message || 'Database error occurred during bulk generation.');
    } finally {
      setBulkSubmitting(false);
    }
  };

  // Helper filters for directory listing
  const getFilteredProjects = () => {
    return projects.filter(p => {
      const parsed = parseDescription(p.description);
      const matchesSearch = searchQuery
        ? (p.project_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           p.project_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
           parsed.developer.toLowerCase().includes(searchQuery.toLowerCase()) ||
           p.city?.toLowerCase().includes(searchQuery.toLowerCase()))
        : true;

      const matchesStatus = statusFilter
        ? p.status.toLowerCase() === statusFilter.toLowerCase()
        : true;

      const matchesLocation = locationFilter
        ? p.city?.toLowerCase() === locationFilter.toLowerCase()
        : true;

      return matchesSearch && matchesStatus && matchesLocation;
    });
  };

  const filteredProjects = getFilteredProjects();

  // Extract distinct cities for filtering
  const cities = Array.from(new Set(projects.map(p => p.city?.trim()).filter(Boolean) as string[]));

  // Compute specific details for selected project
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectTowers = towers.filter(t => t.project_id === selectedProjectId);
  const projectInventory = inventory.filter(i => i.project_id === selectedProjectId);
  const projectBookings = bookings.filter(b => b.project_id === selectedProjectId);

  // Status stats counts
  const totalUnitsCount = projectInventory.length;
  const availableCount = projectInventory.filter(i => i.status.toLowerCase() === 'available').length;
  const blockedCount = projectInventory.filter(i => i.status.toLowerCase() === 'blocked').length;
  const bookedCount = projectInventory.filter(i => i.status.toLowerCase() === 'booked').length;
  const soldCount = projectInventory.filter(i => i.status.toLowerCase() === 'sold').length;

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 border rounded-xl p-4 flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-4 duration-300 ${
          notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-950'
        }`}>
          <div className="flex items-center space-x-2.5">
            <CheckCircle className={`h-5 w-5 ${notification.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`} />
            <span className="text-sm font-semibold">{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600 focus:outline-none ml-4">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Database Error Banner */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-955 rounded-xl p-4 flex items-start space-x-3 shadow-sm">
          <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm">System Database Error</h4>
            <p className="text-xs text-rose-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* VIEW MODE: PROJECTS MASTER LIST */}
      {viewMode === 'list' && (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Projects</h2>
              <p className="text-slate-500 text-sm">Manage projects, towers, inventory and project master data.</p>
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
              {canCreateProject(role) && (
                <button
                  onClick={openNewProject}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg transition-all focus:outline-none"
                >
                  + New Project
                </button>
              )}
            </div>
          </div>

          {/* Directory Toolbar Filters */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative md:col-span-2">
              <Search className="absolute inset-y-0 left-3 h-4 w-4 text-slate-400 self-center top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search projects by name, code, developer..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
              />
            </div>
            <div>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
                className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="upcoming">Upcoming</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <select
                value={locationFilter}
                onChange={(e) => { setLocationFilter(e.target.value); setPage(0); }}
                className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
              >
                <option value="">All Cities</option>
                {cities.map(city => (
                  <option key={city} value={city.toLowerCase()}>{city}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Projects Table */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col">
            {loading ? (
              <div className="py-24 text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-100 border-t-indigo-600 mx-auto mb-4"></div>
                <p className="text-slate-500 font-medium">Loading project directory...</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                        <th className="py-3.5 px-6">Project Name</th>
                        <th className="py-3.5 px-6">Developer</th>
                        <th className="py-3.5 px-6">Location</th>
                        <th className="py-3.5 px-6">Towers</th>
                        <th className="py-3.5 px-6">Total Units</th>
                        <th className="py-3.5 px-6">Available</th>
                        <th className="py-3.5 px-6">Booked</th>
                        <th className="py-3.5 px-6">Status</th>
                        <th className="py-3.5 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProjects.length > 0 ? (
                        filteredProjects.slice(page * pageSize, (page + 1) * pageSize).map((proj) => {
                          const parsed = parseDescription(proj.description);
                          const projTowers = towers.filter(t => t.project_id === proj.id);
                          const projUnits = inventory.filter(i => i.project_id === proj.id);
                          const avail = projUnits.filter(i => i.status.toLowerCase() === 'available').length;
                          const booked = projUnits.filter(i => i.status.toLowerCase() === 'booked').length;

                          return (
                            <tr key={proj.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-4 px-6">
                                <span className="font-semibold text-slate-900 block">{proj.project_name}</span>
                                <span className="text-xxs font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-wider inline-block mt-0.5">
                                  Code: {proj.project_code}
                                </span>
                              </td>
                              <td className="py-4 px-6 text-sm text-slate-600 font-medium">
                                {parsed.developer || 'N/A'}
                              </td>
                              <td className="py-4 px-6 text-sm text-slate-600">
                                {proj.city ? `${proj.city}, ${proj.state || ''}` : 'N/A'}
                              </td>
                              <td className="py-4 px-6 text-sm text-slate-800 font-semibold">{projTowers.length}</td>
                              <td className="py-4 px-6 text-sm text-slate-800 font-semibold">{projUnits.length}</td>
                              <td className="py-4 px-6">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700">
                                  {avail} Available
                                </span>
                              </td>
                              <td className="py-4 px-6">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700">
                                  {booked} Booked
                                </span>
                              </td>
                              <td className="py-4 px-6">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                                  proj.status.toLowerCase() === 'active' ? 'bg-indigo-50 text-indigo-700' :
                                  proj.status.toLowerCase() === 'upcoming' ? 'bg-amber-50 text-amber-700' :
                                  proj.status.toLowerCase() === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  {proj.status}
                                </span>
                              </td>
                              <td className="py-4 px-6 text-right">
                                <div className="flex items-center justify-end space-x-2">
                                  <button
                                    onClick={() => { setSelectedProjectId(proj.id); setViewMode('details'); setActiveTab('overview'); }}
                                    className="inline-flex items-center space-x-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                                  >
                                    <Settings className="h-3.5 w-3.5" />
                                    <span>Manage</span>
                                  </button>
                                  {canManageProjects(role) && (
                                    <button
                                      onClick={() => openEditProject(proj)}
                                      className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors focus:outline-none"
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {isSuperAdmin(role) && (
                                    <button
                                      onClick={() => handleDeleteProject(proj.id)}
                                      className="p-1.5 border border-slate-200 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors focus:outline-none"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={9} className="py-24 text-center text-slate-400">
                            <div className="flex flex-col items-center justify-center space-y-3">
                              <div className="bg-slate-50 p-4 rounded-full text-slate-300">
                                <Layers className="h-8 w-8" />
                              </div>
                              <p className="text-slate-500 font-bold text-sm">No Projects Found</p>
                              <p className="text-xs text-slate-400 max-w-sm">
                                Create a master project to begin scheduling towers, layout inventories, and logging client bookings.
                              </p>
                              {canCreateProject(role) && (
                                <button
                                  onClick={openNewProject}
                                  className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-sm focus:outline-none"
                                >
                                  + Create Project
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination footer */}
                {filteredProjects.length > 0 && (
                  <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">
                      Showing <span className="text-slate-800">{page * pageSize + 1}</span> to{' '}
                      <span className="text-slate-800">{Math.min((page + 1) * pageSize, filteredProjects.length)}</span> of{' '}
                      <span className="text-slate-800">{filteredProjects.length}</span> projects
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setPage(p => Math.max(p - 1, 0))}
                        disabled={page === 0}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus:outline-none disabled:opacity-50"
                      >
                        <ChevronLeft className="h-4.5 w-4.5" />
                      </button>
                      <button
                        onClick={() => setPage(p => p + 1)}
                        disabled={(page + 1) * pageSize >= filteredProjects.length}
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
        </>
      )}

      {/* VIEW MODE: PROJECT DETAILS MANAGEMENT */}
      {viewMode === 'details' && currentProject && (
        <>
          {/* Back Navigation Header */}
          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => { setSelectedProjectId(null); setViewMode('list'); }}
              className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl shadow-sm text-slate-600 transition-colors focus:outline-none"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-slate-900">{currentProject.project_name}</h2>
                <span className={`px-2 py-0.5 rounded-full text-xxs font-bold uppercase tracking-wider ${
                  currentProject.status.toLowerCase() === 'active' ? 'bg-indigo-50 text-indigo-700' :
                  currentProject.status.toLowerCase() === 'upcoming' ? 'bg-amber-50 text-amber-700' :
                  currentProject.status.toLowerCase() === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {currentProject.status}
                </span>
              </div>
              <p className="text-slate-500 text-xs mt-0.5">
                Location: {currentProject.city || 'N/A'} | Code: {currentProject.project_code}
              </p>
            </div>
          </div>

          {/* Project Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col">
              <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider">Towers</span>
              <span className="text-xl font-bold text-slate-900 mt-1">{projectTowers.length}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col">
              <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider">Total Units</span>
              <span className="text-xl font-bold text-slate-900 mt-1">{totalUnitsCount}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col">
              <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider text-emerald-600">Available</span>
              <span className="text-xl font-bold text-emerald-700 mt-1">{availableCount}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col">
              <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider text-amber-600">Blocked</span>
              <span className="text-xl font-bold text-amber-700 mt-1">{blockedCount}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col">
              <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider text-blue-600">Booked</span>
              <span className="text-xl font-bold text-blue-700 mt-1">{bookedCount}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col">
              <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider text-rose-600">Sold</span>
              <span className="text-xl font-bold text-rose-700 mt-1">{soldCount}</span>
            </div>
          </div>

          {/* Detail Tabs Bar */}
          <div className="border-b border-slate-200 flex space-x-6">
            {(['overview', 'towers', 'inventory', 'bookings', ...(isSuperAdmin(role) ? ['payment milestones' as const] : [])] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 text-sm font-semibold tracking-wide border-b-2 transition-all capitalize focus:outline-none ${
                  activeTab === tab
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* TAB CONTENTS: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
              {(() => {
                const parsed = parseDescription(currentProject.description);
                return (
                  <>
                    <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">Project Metadata</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-1">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Developer Name</span>
                        <span className="text-sm font-semibold text-slate-800">{parsed.developer || 'Not Provided'}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">RERA Registration</span>
                        <span className="text-sm font-semibold text-slate-800">{parsed.rera || 'Not Provided'}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Possession Date</span>
                        <span className="text-sm font-semibold text-slate-800">
                          {currentProject.possession_date ? new Date(currentProject.possession_date).toLocaleDateString('en-IN') : 'Not Scheduled'}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Full Address</span>
                        <span className="text-sm font-semibold text-slate-800 leading-relaxed">
                          {currentProject.address || 'N/A'}<br />
                          {currentProject.city ? `${currentProject.city}, ` : ''}{currentProject.state || ''} {currentProject.pincode || ''}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Project Website</span>
                        {parsed.website ? (
                          <a href={parsed.website} target="_blank" rel="noreferrer" className="text-sm font-semibold text-indigo-600 hover:underline flex items-center space-x-1">
                            <Globe className="h-3.5 w-3.5" />
                            <span>Visit Link</span>
                          </a>
                        ) : (
                          <span className="text-sm font-semibold text-slate-800">N/A</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Google Maps Link</span>
                        {parsed.maps_url ? (
                          <a href={parsed.maps_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-indigo-600 hover:underline flex items-center space-x-1">
                            <MapPin className="h-3.5 w-3.5" />
                            <span>Open Map</span>
                          </a>
                        ) : (
                          <span className="text-sm font-semibold text-slate-800">N/A</span>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-5">
                      <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-2">Description / Comments</span>
                      <div className="bg-slate-50 p-4 border border-slate-100 rounded-xl text-sm text-slate-700 leading-relaxed max-h-[250px] overflow-y-auto">
                        {parsed.text || 'No description notes logged.'}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* TAB CONTENTS: TOWERS */}
          {activeTab === 'towers' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-bold text-slate-900">Towers Listing</h3>
                {canManageProjects(role) && (
                  <button
                    onClick={openNewTower}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm focus:outline-none"
                  >
                    + Add Tower
                  </button>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-6">Tower Name</th>
                      <th className="py-3 px-6">Tower Code</th>
                      <th className="py-3 px-6">Floors</th>
                      <th className="py-3 px-6">Units</th>
                      <th className="py-3 px-6">Status</th>
                      <th className="py-3 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projectTowers.length > 0 ? (
                      projectTowers.map((tow) => {
                        const towUnits = projectInventory.filter(i => i.tower_id === tow.id);
                        return (
                          <tr key={tow.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3.5 px-6 font-semibold text-slate-800">{tow.tower_name}</td>
                            <td className="py-3.5 px-6 text-sm text-slate-600 font-medium">{tow.tower_code || 'N/A'}</td>
                            <td className="py-3.5 px-6 text-sm text-slate-800 font-medium">{tow.total_floors || 'N/A'}</td>
                            <td className="py-3.5 px-6 text-sm text-slate-800 font-medium">{towUnits.length}</td>
                            <td className="py-3.5 px-6">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-bold uppercase tracking-wider ${
                                (tow.status || 'active').toLowerCase() === 'active' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {tow.status || 'active'}
                              </span>
                            </td>
                            <td className="py-3.5 px-6 text-right">
                              <div className="flex items-center justify-end space-x-1.5">
                                {canManageProjects(role) && (
                                  <button
                                    onClick={() => openEditTower(tow)}
                                    className="p-1 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {isSuperAdmin(role) && (
                                  <button
                                  onClick={() => handleDeleteTower(tow.id)}
                                  className="p-1 border border-slate-200 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center space-y-2">
                            <Layers className="h-6 w-6 text-slate-300" />
                            <p className="text-slate-500 font-semibold text-xs">No towers added to this project.</p>
                            {canManageProjects(role) && (
                              <button
                                onClick={openNewTower}
                                className="mt-1 bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-xl text-xxs font-semibold shadow-sm focus:outline-none"
                              >
                                + Add Tower
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB CONTENTS: INVENTORY / UNITS */}
          {activeTab === 'inventory' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-bold text-slate-900">Inventory Units</h3>
                <div className="flex items-center space-x-2">
                  {canBulkAddUnits(role) && (
                    <button
                      onClick={() => {
                        if (projectTowers.length === 0) {
                          setNotification({ type: 'error', message: 'You must add at least one tower first before generating units.' });
                          return;
                        }
                        setBulkTowerId(projectTowers[0]?.id || '');
                        setBulkError(null);
                        setIsBulkModalOpen(true);
                      }}
                      className="bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors focus:outline-none"
                    >
                      + Bulk Add Units
                    </button>
                  )}
                  {canManageProjects(role) && (
                    <button
                      onClick={() => {
                        if (projectTowers.length === 0) {
                          setNotification({ type: 'error', message: 'You must add at least one tower first before creating units.' });
                          return;
                        }
                        openNewUnit();
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm focus:outline-none"
                    >
                      + Add Unit
                    </button>
                  )}
                </div>
              </div>

              {/* Units Table */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-6">Unit Number</th>
                      <th className="py-3 px-6">Tower</th>
                      <th className="py-3 px-6">Configuration</th>
                      <th className="py-3 px-6">Carpet Area (sq.ft)</th>
                      <th className="py-3 px-6">Price (₹)</th>
                      <th className="py-3 px-6">Status</th>
                      <th className="py-3 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projectInventory.length > 0 ? (
                      projectInventory.map((unit) => {
                        const tower = towers.find(t => t.id === unit.tower_id);
                        return (
                          <tr key={unit.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3.5 px-6 font-semibold text-slate-800">{unit.unit_number}</td>
                            <td className="py-3.5 px-6 text-sm text-slate-600 font-medium">
                              {tower?.tower_name || 'N/A'}
                            </td>
                            <td className="py-3.5 px-6 text-sm text-slate-700 font-medium">{unit.configuration || 'N/A'}</td>
                            <td className="py-3.5 px-6 text-sm text-slate-700 font-medium">
                              {unit.carpet_area ? `${unit.carpet_area} sq.ft` : 'N/A'}
                            </td>
                            <td className="py-3.5 px-6 text-sm text-slate-900 font-bold">
                              {unit.base_price ? `₹${unit.base_price.toLocaleString('en-IN')}` : 'N/A'}
                            </td>
                            <td className="py-3.5 px-6">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-bold uppercase tracking-wider ${
                                unit.status.toLowerCase() === 'available' ? 'bg-emerald-50 text-emerald-700' :
                                unit.status.toLowerCase() === 'booked' ? 'bg-blue-50 text-blue-700' :
                                unit.status.toLowerCase() === 'blocked' ? 'bg-amber-50 text-amber-700' :
                                'bg-rose-50 text-rose-700'
                              }`}>
                                {unit.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-6 text-right">
                              <div className="flex items-center justify-end space-x-1.5">
                                {canManageProjects(role) && (
                                  <button
                                    onClick={() => openEditUnit(unit)}
                                    className="p-1 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {isSuperAdmin(role) && (
                                  <button
                                  onClick={() => handleDeleteUnit(unit.id)}
                                  className="p-1 border border-slate-200 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center space-y-2">
                            <Home className="h-6 w-6 text-slate-300" />
                            <p className="text-slate-500 font-semibold text-xs">No units added yet.</p>
                            {canManageProjects(role) && (
                              <button
                                onClick={openNewUnit}
                                className="mt-1 bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-xl text-xxs font-semibold shadow-sm focus:outline-none"
                              >
                                + Add Unit
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB CONTENTS: BOOKINGS */}
          {activeTab === 'bookings' && (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-900">Project Bookings Log</h3>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-6">Customer / Lead</th>
                      <th className="py-3 px-6">Flat Unit</th>
                      <th className="py-3 px-6">Booking Amount</th>
                      <th className="py-3 px-6">Booking Date</th>
                      <th className="py-3 px-6">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projectBookings.length > 0 ? (
                      projectBookings.map((b) => {
                        const unit = inventory.find(i => i.id === b.inventory_id);
                        return (
                          <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3.5 px-6 font-semibold text-slate-800">
                              {leadsMap.get(b.lead_id || '') || 'Unnamed Lead'}
                            </td>
                            <td className="py-3.5 px-6 text-sm text-slate-600 font-medium">
                              {unit?.unit_number || 'N/A'}
                            </td>
                            <td className="py-3.5 px-6 text-sm text-slate-900 font-bold">
                              ₹{(b.booking_amount || 0).toLocaleString('en-IN')}
                            </td>
                            <td className="py-3.5 px-6 text-sm text-slate-600">
                              {b.booking_date ? new Date(b.booking_date).toLocaleDateString('en-IN') : 'N/A'}
                            </td>
                            <td className="py-3.5 px-6">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-bold uppercase tracking-wider ${
                                b.status?.toLowerCase() === 'confirmed' ? 'bg-emerald-50 text-emerald-700' :
                                b.status?.toLowerCase() === 'cancelled' ? 'bg-rose-50 text-rose-700' :
                                'bg-slate-100 text-slate-700'
                              }`}>
                                {b.status || 'draft'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400">
                          <p className="text-slate-500 font-semibold text-xs">No bookings logged for this project yet.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB CONTENTS: PAYMENT MILESTONES (super_admin only) */}
          {activeTab === 'payment milestones' && isSuperAdmin(role) && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Payment Milestones</h3>
                <p className="text-slate-500 text-sm">
                  Agreement Value is collected in staged percentages, not all at once. Adding a percentage
                  here immediately increases the currently-due amount on every booking in this project.
                  GST/Stamp Duty/Registration/Other Charges become due at each booking's first payment;
                  Maintenance/Parking/Development Charges become due once possession is marked given.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-semibold text-slate-700">Total Released</span>
                  <span className={`text-lg font-extrabold ${milestones.reduce((s, m) => s + m.percentage, 0) >= 100 ? 'text-emerald-600' : 'text-indigo-600'}`}>
                    {milestones.reduce((sum, m) => sum + m.percentage, 0).toFixed(2)}%
                  </span>
                </div>

                {milestoneError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl p-3 mb-4">{milestoneError}</div>
                )}

                {milestonesLoading ? (
                  <p className="text-xs text-slate-400 py-6 text-center">Loading milestones...</p>
                ) : milestones.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center italic">No payment milestones added yet -- 0% of the Agreement Value is currently due on any booking here.</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {milestones.map(m => (
                      <div key={m.id} className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                        <div>
                          <span className="font-bold text-slate-800 text-sm">{m.percentage}%</span>
                          {m.label && <span className="text-slate-500 text-xs ml-2">{m.label}</span>}
                          <span className="text-slate-350 text-xxs ml-2">{new Date(m.created_at).toLocaleDateString('en-IN')}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteMilestone(m.id)}
                          className="text-rose-500 hover:text-rose-700 text-xs font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t border-slate-100 pt-4 flex items-end gap-3">
                  <div className="w-28">
                    <label className="block text-xxs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Percentage *</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      step="0.01"
                      placeholder="e.g. 35"
                      value={newMilestonePercent}
                      onChange={(e) => setNewMilestonePercent(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xxs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Label (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Plinth completion"
                      value={newMilestoneLabel}
                      onChange={(e) => setNewMilestoneLabel(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleAddMilestone}
                    disabled={milestoneSubmitting || !newMilestonePercent}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                  >
                    {milestoneSubmitting ? 'Adding...' : 'Add Milestone'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* CREATE/EDIT PROJECT MODAL */}
      {isProjectModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsProjectModalOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">{editingProject ? 'Edit Project' : 'Create New Project'}</span>
              <button type="button" onClick={() => setIsProjectModalOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleProjectSubmit}>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-left">
                {projectError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold leading-tight">{projectError}</span>
                  </div>
                )}

                <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider border-b border-indigo-50 pb-1">Project Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Project Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Test Project"
                      value={pName}
                      onChange={(e) => setPName(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Project Code *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. TP-101"
                      value={pCode}
                      onChange={(e) => setPCode(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Developer / Company</label>
                    <input
                      type="text"
                      placeholder="e.g. Tata Realty"
                      value={pDev}
                      onChange={(e) => setPDev(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Project Status *</label>
                    <select
                      value={pStatus}
                      onChange={(e) => setPStatus(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="active">Active</option>
                      <option value="upcoming">Upcoming</option>
                      <option value="completed">Completed</option>
                      <option value="on_hold">On Hold</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider border-b border-indigo-50 pb-1 pt-2">Location Coordinates</h4>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Street Address</label>
                  <input
                    type="text"
                    placeholder="e.g. Dombivli East, Near Station"
                    value={pLocAddress}
                    onChange={(e) => setPLocAddress(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">City</label>
                    <input
                      type="text"
                      placeholder="Dombivli"
                      value={pLocCity}
                      onChange={(e) => setPLocCity(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">State</label>
                    <input
                      type="text"
                      placeholder="Maharashtra"
                      value={pLocState}
                      onChange={(e) => setPLocState(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Pincode</label>
                    <input
                      type="text"
                      placeholder="421201"
                      value={pLocPincode}
                      onChange={(e) => setPLocPincode(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider border-b border-indigo-50 pb-1 pt-2">Compliance & Config</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">RERA Registration No</label>
                    <input
                      type="text"
                      placeholder="P51700012345"
                      value={pRera}
                      onChange={(e) => setPRera(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Possession Date</label>
                    <input
                      type="date"
                      value={pPossession}
                      onChange={(e) => setPPossession(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Website URL</label>
                    <input
                      type="url"
                      placeholder="https://tataroads.com"
                      value={pWebsite}
                      onChange={(e) => setPWebsite(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Google Maps Link</label>
                    <input
                      type="url"
                      placeholder="https://maps.google.com/..."
                      value={pMapsUrl}
                      onChange={(e) => setPMapsUrl(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Description / Notes</label>
                  <textarea
                    placeholder="Describe construction status, specifications..."
                    rows={2}
                    value={pDescText}
                    onChange={(e) => setPDescText(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsProjectModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={projectSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg disabled:opacity-50 transition-all focus:outline-none"
                >
                  {projectSubmitting ? 'Saving...' : editingProject ? 'Update Project' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE/EDIT TOWER MODAL */}
      {isTowerModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsTowerModalOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">{editingTower ? 'Edit Tower' : 'Add Tower'}</span>
              <button type="button" onClick={() => setIsTowerModalOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleTowerSubmit}>
              <div className="p-6 space-y-4 text-left">
                {towerError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3.5 py-2.5 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold leading-tight">{towerError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Tower Name / Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Tower A"
                    value={tName}
                    onChange={(e) => setTName(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Tower Code</label>
                  <input
                    type="text"
                    placeholder="e.g. TWR-A"
                    value={tCode}
                    onChange={(e) => setTCode(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Total Floors</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="15"
                      value={tFloors}
                      onChange={(e) => setTFloors(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Expected Units</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="60"
                      value={tUnits}
                      onChange={(e) => setTUnits(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Tower Status</label>
                  <select
                    value={tStatus}
                    onChange={(e) => setTStatus(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTowerModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={towerSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md disabled:opacity-50 transition-all focus:outline-none"
                >
                  {towerSubmitting ? 'Saving...' : editingTower ? 'Update Tower' : 'Save Tower'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE/EDIT INVENTORY UNIT MODAL */}
      {isUnitModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsUnitModalOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">{editingUnit ? 'Edit Unit' : 'Add Inventory Unit'}</span>
              <button type="button" onClick={() => setIsUnitModalOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUnitSubmit}>
              <div className="p-6 space-y-4 text-left">
                {unitError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3.5 py-2.5 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold leading-tight">{unitError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Unit Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. A-101"
                      value={uNumber}
                      onChange={(e) => setUNumber(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Tower *</label>
                    <select
                      required
                      value={uTowerId}
                      onChange={(e) => setUTowerId(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      {projectTowers.map(t => (
                        <option key={t.id} value={t.id}>{t.tower_name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Configuration</label>
                    <select
                      value={uConfig}
                      onChange={(e) => setUConfig(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="1 BHK">1 BHK</option>
                      <option value="1.5 BHK">1.5 BHK</option>
                      <option value="2 BHK">2 BHK</option>
                      <option value="2.5 BHK">2.5 BHK</option>
                      <option value="3 BHK">3 BHK</option>
                      <option value="4 BHK">4 BHK</option>
                      <option value="Penthouse">Penthouse</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Facing</label>
                    <select
                      value={uFacing}
                      onChange={(e) => setUFacing(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="East">East</option>
                      <option value="West">West</option>
                      <option value="North">North</option>
                      <option value="South">South</option>
                      <option value="North-East">North-East</option>
                      <option value="North-West">North-West</option>
                      <option value="South-East">South-East</option>
                      <option value="South-West">South-West</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Carpet Area (sq.ft)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="450"
                      value={uCarpet}
                      onChange={(e) => setUCarpet(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Built-up Area (sq.ft)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="600"
                      value={uBuiltUp}
                      onChange={(e) => setUBuiltUp(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Base Price (₹)</label>
                    <input
                      type="number"
                      placeholder="e.g. 4500000"
                      value={uPrice}
                      onChange={(e) => setUPrice(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Status *</label>
                    <select
                      value={uStatus}
                      onChange={(e) => setUStatus(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="available">Available</option>
                      <option value="blocked">Blocked</option>
                      <option value="booked">Booked</option>
                      <option value="sold">Sold</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUnitModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={unitSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md disabled:opacity-50 transition-all focus:outline-none"
                >
                  {unitSubmitting ? 'Saving...' : editingUnit ? 'Update Unit' : 'Save Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK UNIT GENERATION MODAL */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsBulkModalOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Bulk Add Units</span>
              <button type="button" onClick={() => setIsBulkModalOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleBulkSubmit}>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-left">
                {bulkError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3.5 py-2.5 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold leading-tight">{bulkError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Target Tower *</label>
                    <select
                      required
                      value={bulkTowerId}
                      onChange={(e) => setBulkTowerId(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      {projectTowers.map(t => (
                        <option key={t.id} value={t.id}>{t.tower_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Configuration</label>
                    <select
                      value={bulkConfig}
                      onChange={(e) => setBulkConfig(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="1 BHK">1 BHK</option>
                      <option value="1.5 BHK">1.5 BHK</option>
                      <option value="2 BHK">2 BHK</option>
                      <option value="2.5 BHK">2.5 BHK</option>
                      <option value="3 BHK">3 BHK</option>
                      <option value="4 BHK">4 BHK</option>
                    </select>
                  </div>
                </div>

                <h4 className="text-xxs font-bold text-indigo-600 uppercase tracking-wider">Layout Generation Formula</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Floor From</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={bulkFloorFrom}
                      onChange={(e) => setBulkFloorFrom(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Floor To</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={bulkFloorTo}
                      onChange={(e) => setBulkFloorTo(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Units / Floor</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="20"
                      value={bulkUnitsPerFloor}
                      onChange={(e) => setBulkUnitsPerFloor(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <h4 className="text-xxs font-bold text-indigo-600 uppercase tracking-wider pt-2">Specifications</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Carpet Area (sq.ft)</label>
                    <input
                      type="number"
                      value={bulkCarpet}
                      onChange={(e) => setBulkCarpet(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Built-up Area (sq.ft)</label>
                    <input
                      type="number"
                      value={bulkBuiltUp}
                      onChange={(e) => setBulkBuiltUp(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Facing</label>
                    <select
                      value={bulkFacing}
                      onChange={(e) => setBulkFacing(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="East">East</option>
                      <option value="West">West</option>
                      <option value="North">North</option>
                      <option value="South">South</option>
                      <option value="North-East">North-East</option>
                      <option value="North-West">North-West</option>
                      <option value="South-East">South-East</option>
                      <option value="South-West">South-West</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Base Price (₹)</label>
                    <input
                      type="number"
                      value={bulkPrice}
                      onChange={(e) => setBulkPrice(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Pre-generation counts estimator text */}
                {(() => {
                  const fFrom = parseInt(bulkFloorFrom);
                  const fTo = parseInt(bulkFloorTo);
                  const uPerFloor = parseInt(bulkUnitsPerFloor);
                  if (isNaN(fFrom) || isNaN(fTo) || isNaN(uPerFloor) || fTo < fFrom) return null;
                  const count = (fTo - fFrom + 1) * uPerFloor;
                  return (
                    <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-950 font-semibold flex items-center space-x-2">
                      <Layers className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                      <span>Generator Preview: This formula will auto-compile {count} units.</span>
                    </div>
                  );
                })()}
              </div>

              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md disabled:opacity-50 transition-all focus:outline-none"
                >
                  {bulkSubmitting ? 'Generating...' : 'Create Units'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
