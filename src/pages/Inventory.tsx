import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import {
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  X,
  AlertCircle,
  CheckCircle,
  Home,
  Clock,
  User,
  IndianRupee,
  Map as MapIcon,
  List
} from 'lucide-react';

// Sorts unit numbers the way a person reads them (302, 402, 1501, 1502)
// regardless of upload order -- a plain string sort would put "1501"
// before "302" since '1' < '3', and no sort at all just shows DB
// insertion order, which is what was happening before.
const unitNumberCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// Interfaces mapping database columns
interface Project {
  id: string;
  project_name: string;
  project_code: string | null;
  status: string | null;
  description: string | null;
}

interface Tower {
  id: string;
  project_id: string;
  tower_name: string;
  tower_code: string | null;
  total_floors?: number | null;
  total_units?: number | null;
  status: string | null;
}

interface Floor {
  id: string;
  tower_id: string;
  floor_number: number;
  floor_name: string | null;
  total_units?: number | null;
  created_at?: string;
  updated_at?: string;
}

interface InventoryUnit {
  id: string;
  project_id: string;
  tower_id: string;
  floor_id: string;
  unit_number: string;
  configuration: string | null;
  carpet_area: number | null;
  built_up_area: number | null;
  saleable_area?: number | null;
  facing: string | null;
  base_price: number | null;
  status: string;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
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
  booking_number?: string | null;
  customer_name?: string | null;
}

// Helpers for serializing/deserializing unit type and remarks inside the notes column
interface UnitNotesJSON {
  unit_type?: string;
  remarks?: string;
  view?: string;
  parking?: string;
  possession_date?: string;
  hold_date?: string;
  hold_expiry?: string;
  hold_lead_id?: string;
}

const parseNotes = (notesStr: string | null): UnitNotesJSON => {
  if (!notesStr) {
    return {};
  }
  try {
    const trimmed = notesStr.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return JSON.parse(trimmed);
    }
  } catch (err) {
    // Plain text fallback
  }
  return { remarks: notesStr };
};

const serializeNotes = (data: UnitNotesJSON): string => {
  return JSON.stringify(data);
};

export const Inventory: React.FC = () => {
  // Master lists loaded from Supabase
  const [projects, setProjects] = useState<Project[]>([]);
  const [towers, setTowers] = useState<Tower[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [inventoryList, setInventoryList] = useState<InventoryUnit[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [leadsMap, setLeadsMap] = useState<Map<string, string>>(new Map());
  const [leadsList, setLeadsList] = useState<{ id: string; customer_name: string | null }[]>([]);

  // Search & Filter states (Directory)
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [towerFilter, setTowerFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState('');
  const [configFilter, setConfigFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Page Loaders & Alerts
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals visibility toggles
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<InventoryUnit | null>(null);
  const [unitError, setUnitError] = useState<string | null>(null);
  const [unitSubmitting, setUnitSubmitting] = useState(false);

  const [isTowerModalOpen, setIsTowerModalOpen] = useState(false);
  const [towerError, setTowerError] = useState<string | null>(null);
  const [towerSubmitting, setTowerSubmitting] = useState(false);

  const [isFloorModalOpen, setIsFloorModalOpen] = useState(false);
  const [floorError, setFloorError] = useState<string | null>(null);
  const [floorSubmitting, setFloorSubmitting] = useState(false);

  const [selectedUnit, setSelectedUnit] = useState<InventoryUnit | null>(null);

  // Layout Explorer view states
  const [activeTab, setActiveTab] = useState<'list' | 'hierarchy'>('list');
  const [explorerTowerId, setExplorerTowerId] = useState('');
  const [explorerFloorId, setExplorerFloorId] = useState('');

  // Unit creation / edit form inputs
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedTowerId, setSelectedTowerId] = useState('');
  const [selectedFloorId, setSelectedFloorId] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [unitType, setUnitType] = useState('Standard');
  const [unitConfig, setUnitConfig] = useState('1 BHK');
  const [unitCarpet, setUnitCarpet] = useState('');
  const [unitBuiltUp, setUnitBuiltUp] = useState('');
  const [unitSaleableArea, setUnitSaleableArea] = useState('');
  const [unitFacing, setUnitFacing] = useState('');
  const [unitView, setUnitView] = useState('');
  const [unitParking, setUnitParking] = useState('');
  const [unitPossessionDate, setUnitPossessionDate] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [unitStatus, setUnitStatus] = useState('available');
  const [unitRemarks, setUnitRemarks] = useState('');
  const [unitHoldDate, setUnitHoldDate] = useState('');
  const [unitHoldExpiry, setUnitHoldExpiry] = useState('');
  const [unitHoldLeadId, setUnitHoldLeadId] = useState('');

  // Tower creation form inputs
  const [towerProjId, setTowerProjId] = useState('');
  const [towerName, setTowerName] = useState('');
  const [towerCode, setTowerCode] = useState('');
  const [towerFloors, setTowerFloors] = useState('10');
  const [towerUnitsPerFloor, setTowerUnitsPerFloor] = useState('4');
  const [towerStatus, setTowerStatus] = useState('active');

  // Floor creation form inputs
  const [floorProjId, setFloorProjId] = useState('');
  const [floorTowerId, setFloorTowerId] = useState('');
  const [floorNumberInput, setFloorNumberInput] = useState('');
  const [floorNameInput, setFloorNameInput] = useState('');
  const [floorTotalUnits, setFloorTotalUnits] = useState('4');

  // Bulk Add Units modal states
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkProjId, setBulkProjId] = useState('');
  const [bulkTowerId, setBulkTowerId] = useState('');
  const [bulkFromFloor, setBulkFromFloor] = useState('1');
  const [bulkToFloor, setBulkToFloor] = useState('10');
  const [bulkUnitsPerFloor, setBulkUnitsPerFloor] = useState('4');
  const [bulkConfig, setBulkConfig] = useState('1 BHK');
  // Unit Type and Base Price were removed from the bulk-add form — these
  // stay as plain constants (not state) since nothing sets them anymore,
  // but the insert payload below still needs a value for each column.
  const bulkUnitType = 'Standard';
  const bulkPrice = '';
  const [bulkCarpet, setBulkCarpet] = useState('');
  const [bulkBuiltUp, setBulkBuiltUp] = useState('');
  const [bulkStatus, setBulkStatus] = useState('available');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkPreview, setBulkPreview] = useState<{ floorNumber: number; unitNumber: string; isDuplicate: boolean }[]>([]);

  // Fetch data query from Supabase
  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [projRes, towRes, floorRes, invRes, bkRes, leadsRes] = await Promise.all([
        supabase.from('projects').select('id, project_name, project_code, status, description'),
        supabase.from('project_towers').select('*'),
        supabase.from('project_floors').select('*'),
        supabase.from('project_inventory').select('*'),
        supabase.from('bookings').select('*'),
        supabase.from('leads').select('id, customer_name')
      ]);

      if (projRes.error) throw new Error(projRes.error.message);
      if (towRes.error) throw new Error(towRes.error.message);
      if (floorRes.error) throw new Error(floorRes.error.message);
      if (invRes.error) throw new Error(invRes.error.message);
      if (bkRes.error) throw new Error(bkRes.error.message);

      setProjects(projRes.data || []);
      setTowers(towRes.data || []);
      setFloors(floorRes.data || []);
      setInventoryList(invRes.data || []);
      setBookings(bkRes.data || []);

      if (leadsRes.data) {
        setLeadsMap(new Map(leadsRes.data.map(l => [l.id, l.customer_name || 'Unnamed Lead'])));
        setLeadsList(leadsRes.data || []);
      }
    } catch (err: any) {
      console.error('Inventory fetchData exception:', err);
      setError(err.message || 'Failed to sync inventory master records.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sync / refresh callback
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    await fetchData();
  };

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const t = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(t);
    }
  }, [notification]);

  // Project select changes clears tower & floor choice
  const handleFormProjectChange = (projId: string) => {
    setSelectedProjectId(projId);
    setSelectedTowerId('');
    setSelectedFloorId('');
  };

  // Tower select changes clears floor choice
  const handleFormTowerChange = (towId: string) => {
    setSelectedTowerId(towId);
    setSelectedFloorId('');
  };

  // Modal creation opens
  const openNewUnitModal = () => {
    setEditingUnit(null);
    setSelectedProjectId(projects[0]?.id || '');
    setSelectedTowerId('');
    setSelectedFloorId('');
    setUnitNumber('');
    setUnitType('Standard');
    setUnitConfig('1 BHK');
    setUnitCarpet('');
    setUnitBuiltUp('');
    setUnitSaleableArea('');
    setUnitFacing('');
    setUnitView('');
    setUnitParking('');
    setUnitPossessionDate('');
    setUnitPrice('');
    setUnitStatus('available');
    setUnitRemarks('');
    setUnitHoldDate('');
    setUnitHoldExpiry('');
    setUnitHoldLeadId('');
    setUnitError(null);
    setIsUnitModalOpen(true);
  };

  const openEditUnitModal = (unit: InventoryUnit) => {
    setEditingUnit(unit);
    const parsed = parseNotes(unit.notes);
    setSelectedProjectId(unit.project_id);
    setSelectedTowerId(unit.tower_id);
    setSelectedFloorId(unit.floor_id);
    setUnitNumber(unit.unit_number);
    setUnitType(parsed.unit_type || 'Standard');
    setUnitConfig(unit.configuration || '1 BHK');
    setUnitCarpet(unit.carpet_area ? String(unit.carpet_area) : '');
    setUnitBuiltUp(unit.built_up_area ? String(unit.built_up_area) : '');
    setUnitSaleableArea(unit.saleable_area ? String(unit.saleable_area) : '');
    setUnitFacing(unit.facing || '');
    setUnitView(parsed.view || '');
    setUnitParking(parsed.parking || '');
    setUnitPossessionDate(parsed.possession_date || '');
    setUnitPrice(unit.base_price ? String(unit.base_price) : '');
    setUnitStatus(unit.status);
    setUnitRemarks(parsed.remarks || '');
    setUnitHoldDate(parsed.hold_date || '');
    setUnitHoldExpiry(parsed.hold_expiry || '');
    setUnitHoldLeadId(parsed.hold_lead_id || '');
    setUnitError(null);
    setIsUnitModalOpen(true);
  };

  const openNewTowerModal = () => {
    setTowerProjId(selectedProjectId || projects[0]?.id || '');
    setTowerName('');
    setTowerCode('');
    setTowerFloors('10');
    setTowerUnitsPerFloor('4');
    setTowerStatus('active');
    setTowerError(null);
    setIsTowerModalOpen(true);
  };

  const openNewFloorModal = () => {
    setFloorProjId(selectedProjectId || '');
    setFloorTowerId(selectedTowerId || '');
    setFloorNumberInput('');
    setFloorNameInput('');
    setFloorTotalUnits('4');
    setFloorError(null);
    setIsFloorModalOpen(true);
  };

  // Submit Tower save query
  const handleTowerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!towerProjId) {
      setTowerError('Please select a parent Project.');
      return;
    }
    if (!towerName.trim()) {
      setTowerError('Tower Name is required.');
      return;
    }

    // Uniqueness validation within project
    const isDuplicateTower = towers.some(t => 
      t.project_id === towerProjId && 
      (t.tower_name.toLowerCase() === towerName.trim().toLowerCase() ||
       (towerCode.trim() && t.tower_code?.toLowerCase() === towerCode.trim().toLowerCase()))
    );
    if (isDuplicateTower) {
      setTowerError('A tower with this name or code already exists in this project.');
      return;
    }

    setTowerError(null);
    setTowerSubmitting(true);

    try {
      const floorsNum = towerFloors ? parseInt(towerFloors) : 0;
      const unitsPerFloorNum = towerUnitsPerFloor ? parseInt(towerUnitsPerFloor) : 0;
      const totalUnitsCalculated = floorsNum * unitsPerFloorNum;

      const { data, error: insertError } = await supabase
        .from('project_towers')
        .insert([
          {
            project_id: towerProjId,
            tower_name: towerName.trim(),
            tower_code: towerCode.trim() || null,
            total_floors: floorsNum || null,
            total_units: totalUnitsCalculated || null,
            status: towerStatus
          }
        ])
        .select();

      if (insertError) throw new Error(insertError.message);

      setNotification({ type: 'success', message: 'Tower created successfully.' });
      setIsTowerModalOpen(false);

      // Refresh data
      await fetchData();

      // Pre-select newly created tower if unit modal is open
      if (isUnitModalOpen && data && data[0]) {
        setSelectedProjectId(towerProjId);
        setSelectedTowerId(data[0].id);
        setSelectedFloorId('');
      }
    } catch (err: any) {
      console.error('Tower creation exception:', err);
      setTowerError(err.message || 'Database error occurred while adding tower.');
    } finally {
      setTowerSubmitting(false);
    }
  };

  // Submit Floor save query
  const handleFloorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!floorTowerId) {
      setFloorError('Please select a parent Tower.');
      return;
    }
    const fNo = parseInt(floorNumberInput);
    if (isNaN(fNo)) {
      setFloorError('Floor Number is required and must be a valid integer.');
      return;
    }

    // Floor number uniqueness validation inside a tower
    const isDuplicateFloor = floors.some(f => 
      f.tower_id === floorTowerId && 
      f.floor_number === fNo
    );
    if (isDuplicateFloor) {
      setFloorError('A floor with this number already exists in this tower.');
      return;
    }

    setFloorError(null);
    setFloorSubmitting(true);

    try {
      const { data, error: insertError } = await supabase
        .from('project_floors')
        .insert([
          {
            tower_id: floorTowerId,
            floor_number: fNo,
            floor_name: floorNameInput.trim() || `Floor ${fNo}`,
            total_units: floorTotalUnits ? parseInt(floorTotalUnits) : null
          }
        ])
        .select();

      if (insertError) throw new Error(insertError.message);

      setNotification({ type: 'success', message: 'Floor created successfully.' });
      setIsFloorModalOpen(false);

      // Refresh data
      await fetchData();

      // Pre-select newly created floor if unit modal is open
      if (isUnitModalOpen && data && data[0]) {
        setSelectedTowerId(floorTowerId);
        setSelectedFloorId(data[0].id);
      }
    } catch (err: any) {
      console.error('Floor creation exception:', err);
      setFloorError(err.message || 'Database error occurred while adding floor.');
    } finally {
      setFloorSubmitting(false);
    }
  };

  // Submit Unit save query
  const handleUnitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) {
      setUnitError('Please select a Project.');
      return;
    }
    if (!selectedTowerId) {
      setUnitError('Please select a Tower.');
      return;
    }
    if (!selectedFloorId) {
      setUnitError('Please select a Floor.');
      return;
    }
    if (!unitNumber.trim()) {
      setUnitError('Unit Number is required.');
      return;
    }

    // Unit number uniqueness check inside tower
    const isDuplicate = inventoryList.some(i => 
      i.project_id === selectedProjectId &&
      i.tower_id === selectedTowerId &&
      i.id !== editingUnit?.id &&
      i.unit_number.toLowerCase() === unitNumber.trim().toLowerCase()
    );
    if (isDuplicate) {
      setUnitError(`Unit ${unitNumber} already exists in this tower.`);
      return;
    }

    setUnitError(null);
    setUnitSubmitting(true);

    try {
      // 1. Fetch latest database status of the unit to ensure integrity
      let dbStatus = 'available';
      if (editingUnit) {
        const { data: dbUnit, error: fetchErr } = await supabase
          .from('project_inventory')
          .select('status')
          .eq('id', editingUnit.id)
          .single();
        
        if (fetchErr || !dbUnit) {
          throw new Error("Inventory unit does not exist in the database.");
        }
        dbStatus = dbUnit.status;
      }

      // 2. Validate controlled status transitions
      if (editingUnit && dbStatus.toLowerCase() !== unitStatus.toLowerCase()) {
        const oldStatus = dbStatus.toLowerCase();
        const newStatus = unitStatus.toLowerCase();
        
        let allowed = false;
        if (oldStatus === 'available' && ['hold', 'booked', 'blocked'].includes(newStatus)) {
          allowed = true;
        } else if (oldStatus === 'hold' && ['available', 'booked'].includes(newStatus)) {
          allowed = true;
        } else if (oldStatus === 'blocked' && newStatus === 'available') {
          allowed = true;
        } else if (oldStatus === 'booked' && ['sold', 'cancelled'].includes(newStatus)) {
          allowed = true;
        } else if (oldStatus === 'cancelled' && newStatus === 'available') {
          allowed = true;
        }
        
        if (!allowed) {
          throw new Error(`Status transition from ${oldStatus.toUpperCase()} to ${newStatus.toUpperCase()} is not allowed. Sold units are locked, and booked units can only transition to Sold or Cancelled.`);
        }
      }

      const serializedNotes = serializeNotes({
        unit_type: unitType,
        remarks: unitRemarks.trim(),
        view: unitView.trim(),
        parking: unitParking.trim(),
        possession_date: unitPossessionDate,
        hold_date: unitStatus === 'hold' ? unitHoldDate : undefined,
        hold_expiry: unitStatus === 'hold' ? unitHoldExpiry : undefined,
        hold_lead_id: unitStatus === 'hold' ? unitHoldLeadId : undefined
      });

      const payload = {
        project_id: selectedProjectId,
        tower_id: selectedTowerId,
        floor_id: selectedFloorId,
        unit_number: unitNumber.trim(),
        configuration: unitConfig || null,
        carpet_area: unitCarpet ? parseFloat(unitCarpet) : null,
        built_up_area: unitBuiltUp ? parseFloat(unitBuiltUp) : null,
        saleable_area: unitSaleableArea ? parseFloat(unitSaleableArea) : null,
        facing: unitFacing.trim() || null,
        base_price: unitPrice ? parseFloat(unitPrice) : null,
        status: unitStatus,
        notes: serializedNotes
      };

      if (editingUnit) {
        const { error: editErr } = await supabase
          .from('project_inventory')
          .update(payload)
          .eq('id', editingUnit.id);
        if (editErr) throw new Error(editErr.message);

        setNotification({ type: 'success', message: 'Inventory unit updated successfully.' });
      } else {
        const { error: insertErr } = await supabase
          .from('project_inventory')
          .insert([payload]);
        if (insertErr) throw new Error(insertErr.message);

        setNotification({ type: 'success', message: 'Inventory unit created successfully.' });
      }

      setIsUnitModalOpen(false);
      await fetchData();
    } catch (err: any) {
      console.error('Unit save error:', err);
      if (err.code === '23505' || (err.message && err.message.toLowerCase().includes('unique constraint'))) {
        setUnitError(`Unit ${unitNumber} already exists in this tower.`);
      } else {
        setUnitError(err.message || 'Database error occurred while saving unit.');
      }
    } finally {
      setUnitSubmitting(false);
    }
  };

  // Filter listings
  const getFilteredInventory = () => {
    return inventoryList.filter(item => {
      const proj = projects.find(p => p.id === item.project_id);
      const tower = towers.find(t => t.id === item.tower_id);

      const matchesSearch = searchQuery
        ? (item.unit_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
           proj?.project_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           tower?.tower_name.toLowerCase().includes(searchQuery.toLowerCase()))
        : true;

      const matchesProject = projectFilter
        ? item.project_id === projectFilter
        : true;

      const matchesTower = towerFilter
        ? item.tower_id === towerFilter
        : true;

      const matchesFloor = floorFilter
        ? item.floor_id === floorFilter
        : true;

      const matchesConfig = configFilter
        ? item.configuration === configFilter
        : true;

      const matchesStatus = statusFilter
        ? item.status.toLowerCase() === statusFilter.toLowerCase()
        : true;

      return matchesSearch && matchesProject && matchesTower && matchesFloor && matchesConfig && matchesStatus;
    }).sort((a, b) => unitNumberCollator.compare(a.unit_number, b.unit_number));
  };

  // Bulk Units generator preview handler
  const handleBulkPreview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkProjId || !bulkTowerId || !bulkFromFloor || !bulkToFloor || !bulkUnitsPerFloor) {
      setBulkError('Please fill in Project, Tower, Floor range, and Units per floor.');
      return;
    }
    const from = parseInt(bulkFromFloor);
    const to = parseInt(bulkToFloor);
    const unitsPerFloor = parseInt(bulkUnitsPerFloor);
    if (isNaN(from) || isNaN(to) || isNaN(unitsPerFloor) || from > to) {
      setBulkError('Invalid floor range or units per floor count configuration.');
      return;
    }
    
    setBulkError(null);
    const previews: { floorNumber: number; unitNumber: string; isDuplicate: boolean }[] = [];
    
    for (let f = from; f <= to; f++) {
      for (let u = 1; u <= unitsPerFloor; u++) {
        const unitNo = `${f}${String(u).padStart(2, '0')}`;
        const isDuplicate = inventoryList.some(item => 
          item.project_id === bulkProjId && 
          item.tower_id === bulkTowerId && 
          item.unit_number === unitNo
        );
        previews.push({
          floorNumber: f,
          unitNumber: unitNo,
          isDuplicate
        });
      }
    }
    
    setBulkPreview(previews);
  };

  // Submit bulk units to Supabase
  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkProjId || !bulkTowerId || bulkPreview.length === 0) {
      setBulkError('Please preview generated units before saving.');
      return;
    }

    const from = parseInt(bulkFromFloor);
    const to = parseInt(bulkToFloor);
    const unitsPerFloor = parseInt(bulkUnitsPerFloor);

    setBulkError(null);
    setBulkSubmitting(true);

    try {
      // 1. Generate missing floors
      const missingFloors = [];
      for (let f = from; f <= to; f++) {
        const exists = floors.some(fl => fl.tower_id === bulkTowerId && fl.floor_number === f);
        if (!exists) {
          missingFloors.push({
            tower_id: bulkTowerId,
            floor_number: f,
            floor_name: `Floor ${f}`,
            total_units: unitsPerFloor
          });
        }
      }

      if (missingFloors.length > 0) {
        const { error: floorErr } = await supabase
          .from('project_floors')
          .insert(missingFloors);
        if (floorErr) throw new Error(`Floor Generation Error: ${floorErr.message}`);
        await fetchData();
      }

      // 2. Resolve final floor IDs
      const { data: latestFloors, error: fetchFloorsErr } = await supabase
        .from('project_floors')
        .select('*')
        .eq('tower_id', bulkTowerId);
      if (fetchFloorsErr) throw new Error(`Failed to resolve floor IDs: ${fetchFloorsErr.message}`);
      if (!latestFloors) throw new Error('No floors returned for mapping.');

      // 3. Batch insert non-duplicate units
      const unitsToInsert = bulkPreview
        .filter(p => !p.isDuplicate)
        .map(p => {
          const floorObj = latestFloors.find((fl: any) => fl.floor_number === p.floorNumber);
          if (!floorObj) throw new Error(`Could not map floor level ${p.floorNumber} to database ID.`);
          
          return {
            project_id: bulkProjId,
            tower_id: bulkTowerId,
            floor_id: floorObj.id,
            unit_number: p.unitNumber,
            configuration: bulkConfig || null,
            carpet_area: bulkCarpet ? parseFloat(bulkCarpet) : null,
            built_up_area: bulkBuiltUp ? parseFloat(bulkBuiltUp) : null,
            base_price: bulkPrice ? parseFloat(bulkPrice) : null,
            status: bulkStatus,
            notes: serializeNotes({ unit_type: bulkUnitType, remarks: 'Bulk Generated' })
          };
        });

      if (unitsToInsert.length > 0) {
        const { error: unitInsertErr } = await supabase
          .from('project_inventory')
          .insert(unitsToInsert);
        if (unitInsertErr) throw new Error(`Unit Generation Error: ${unitInsertErr.message}`);
      }

      setNotification({
        type: 'success',
        message: `Bulk creation successful. Created ${unitsToInsert.length} units.`
      });
      setIsBulkModalOpen(false);
      setBulkPreview([]);
      await fetchData();
    } catch (err: any) {
      console.error('Bulk creation error:', err);
      setBulkError(err.message || 'Database error occurred during batch creation.');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const { role } = useAuth();
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'super_admin' || role === 'project_admin';

  const getStats = (list: InventoryUnit[]) => {
    const total = list.length;
    const available = list.filter(item => item.status?.toLowerCase() === 'available').length;
    const hold = list.filter(item => item.status?.toLowerCase() === 'hold').length;
    const blocked = list.filter(item => item.status?.toLowerCase() === 'blocked').length;
    const booked = list.filter(item => item.status?.toLowerCase() === 'booked').length;
    const sold = list.filter(item => item.status?.toLowerCase() === 'sold').length;
    const cancelled = list.filter(item => item.status?.toLowerCase() === 'cancelled').length;
    return { total, available, hold, blocked, booked, sold, cancelled };
  };

  const filteredInventory = getFilteredInventory();
  const stats = getStats(projectFilter ? inventoryList.filter(item => item.project_id === projectFilter) : inventoryList);

  // Towers & Floors lists for filter dropdowns
  const filteredTowersForDropdown = towers.filter(t => t.project_id === projectFilter);
  const filteredFloorsForDropdown = floors.filter(f => f.tower_id === towerFilter);
  
  const uniqueConfigs = Array.from(new Set(inventoryList.map(item => item.configuration).filter((c): c is string => !!c)));

  // Available list maps for modal dropdown cascading
  const formAvailableTowers = towers.filter(t => t.project_id === selectedProjectId);
  const formAvailableFloors = floors.filter(f => f.tower_id === selectedTowerId);

  // Map Project, Tower, and Floor names to display in directory
  const getProjectName = (id: string) => projects.find(p => p.id === id)?.project_name || 'N/A';
  const getTowerName = (id: string) => towers.find(t => t.id === id)?.tower_name || 'N/A';
  const getFloorName = (id: string) => {
    const f = floors.find(fl => fl.id === id);
    if (!f) return 'N/A';
    return f.floor_name || `Floor ${f.floor_number}`;
  };

  interface ProjectDescriptionJSON {
    developer?: string;
    location?: string;
    rera?: string;
    website?: string;
    maps_url?: string;
    text?: string;
  }

  const parseProjectDescription = (descStr: string | null): ProjectDescriptionJSON => {
    if (!descStr) return {};
    try {
      const trimmed = descStr.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        return JSON.parse(trimmed);
      }
    } catch (err) {
      // Plain text fallback
    }
    return { text: descStr };
  };

  // Delete Unit action handler with booking reference protection
  const handleDeleteUnit = async (unit: InventoryUnit) => {
    const hasBooking = bookings.some(b => b.inventory_id === unit.id);
    if (hasBooking) {
      setNotification({
        type: 'error',
        message: 'This unit cannot be deleted because dependent booking records exist.'
      });
      return;
    }
    
    if (!window.confirm(`Are you sure you want to delete Unit ${unit.unit_number}?`)) {
      return;
    }
    
    try {
      const { error: deleteErr } = await supabase
        .from('project_inventory')
        .delete()
        .eq('id', unit.id);
      
      if (deleteErr) throw new Error(deleteErr.message);
      
      setNotification({
        type: 'success',
        message: `Unit ${unit.unit_number} deleted successfully.`
      });
      await fetchData();
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to delete unit.'
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 border rounded-xl p-4 flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-4 duration-300 ${
          notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-955'
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Inventory</h2>
          <p className="text-slate-500 text-sm">Manage projects, towers, floors and unit availability.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center space-x-2 bg-white border border-slate-200 px-3 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm focus:outline-none disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 text-slate-500 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync'}</span>
          </button>
          
          {isSuperAdmin && (
            <button
              onClick={() => {
                setBulkProjId(projectFilter || projects[0]?.id || '');
                setBulkTowerId('');
                setBulkPreview([]);
                setBulkError(null);
                setIsBulkModalOpen(true);
              }}
              className="bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 px-3 py-2 rounded-xl text-sm font-semibold transition-colors focus:outline-none"
            >
              Bulk Add Units
            </button>
          )}

          {isAdmin && (
            <>
              <button
                onClick={openNewTowerModal}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-sm font-semibold transition-colors focus:outline-none"
              >
                + Add Tower
              </button>
              <button
                onClick={openNewFloorModal}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-sm font-semibold transition-colors focus:outline-none"
              >
                + Add Floor
              </button>
              <button
                onClick={openNewUnitModal}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-xl text-sm font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg transition-all focus:outline-none"
              >
                + Add Unit
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dashboard Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Total Units</span>
          <span className="block text-2xl font-extrabold text-slate-900 mt-1">{stats.total}</span>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 shadow-sm">
          <span className="block text-xxs font-bold text-emerald-600 uppercase tracking-wider">Available</span>
          <span className="block text-2xl font-extrabold text-emerald-700 mt-1">{stats.available}</span>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 shadow-sm">
          <span className="block text-xxs font-bold text-indigo-600 uppercase tracking-wider">Held</span>
          <span className="block text-2xl font-extrabold text-indigo-700 mt-1">{stats.hold}</span>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 shadow-sm">
          <span className="block text-xxs font-bold text-amber-600 uppercase tracking-wider">Blocked</span>
          <span className="block text-2xl font-extrabold text-amber-700 mt-1">{stats.blocked}</span>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 shadow-sm">
          <span className="block text-xxs font-bold text-blue-600 uppercase tracking-wider">Booked</span>
          <span className="block text-2xl font-extrabold text-blue-700 mt-1">{stats.booked}</span>
        </div>
        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 shadow-sm">
          <span className="block text-xxs font-bold text-rose-600 uppercase tracking-wider">Sold</span>
          <span className="block text-2xl font-extrabold text-rose-700 mt-1">{stats.sold}</span>
        </div>
      </div>

      {/* Project details card (Project-wise summaries) */}
      {projectFilter && (() => {
        const selectedProj = projects.find(p => p.id === projectFilter);
        const descObj = parseProjectDescription(selectedProj?.description || null);
        const totalTowers = towers.filter(t => t.project_id === projectFilter).length;
        const totalFloors = floors.filter(f => towers.some(t => t.project_id === projectFilter && t.id === f.tower_id)).length;
        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedProj?.project_name}</h3>
                <p className="text-xs text-slate-400 mt-1">Location: {descObj.location || 'N/A'} | Developer: {descObj.developer || 'N/A'}</p>
              </div>
              <span className={`inline-flex px-2 py-0.5 rounded text-xxs font-semibold uppercase ${
                selectedProj?.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-700'
              }`}>
                Project: {selectedProj?.status || 'Active'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-100 text-xs">
              <div>
                <span className="block text-slate-400 font-bold uppercase text-xxs">Total Towers</span>
                <span className="text-sm font-semibold text-slate-800">{totalTowers}</span>
              </div>
              <div>
                <span className="block text-slate-400 font-bold uppercase text-xxs">Total Floors</span>
                <span className="text-sm font-semibold text-slate-800">{totalFloors}</span>
              </div>
              <div>
                <span className="block text-slate-400 font-bold uppercase text-xxs">Project Code</span>
                <span className="text-sm font-semibold text-slate-800">{selectedProj?.project_code || 'N/A'}</span>
              </div>
              <div>
                <span className="block text-slate-400 font-bold uppercase text-xxs">RERA Registered</span>
                <span className="text-sm font-semibold text-slate-800">{descObj.rera || 'N/A'}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tabs list view vs hierarchy explorer */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('list')}
          className={`flex items-center space-x-2 px-6 py-3 border-b-2 font-semibold text-sm transition-all focus:outline-none ${
            activeTab === 'list'
              ? 'border-indigo-600 text-indigo-600 bg-slate-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <List className="h-4 w-4" />
          <span>Flat Directory List</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('hierarchy');
            if (projectFilter) {
              const tow = towers.find(t => t.project_id === projectFilter);
              if (tow) {
                setExplorerTowerId(tow.id);
                const fl = floors.find(f => f.tower_id === tow.id);
                if (fl) setExplorerFloorId(fl.id);
              }
            }
          }}
          className={`flex items-center space-x-2 px-6 py-3 border-b-2 font-semibold text-sm transition-all focus:outline-none ${
            activeTab === 'hierarchy'
              ? 'border-indigo-600 text-indigo-600 bg-slate-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <MapIcon className="h-4 w-4" />
          <span>Hierarchy Map Explorer</span>
        </button>
      </div>

      {activeTab === 'list' ? (
        <>
          {/* Toolbar Search & Filters */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search className="absolute inset-y-0 left-3 h-4 w-4 text-slate-400 self-center top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search unit, project, tower..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
              />
            </div>

            {/* Project Filter */}
            <div>
              <select
                value={projectFilter}
                onChange={(e) => { 
                  setProjectFilter(e.target.value); 
                  setTowerFilter(''); 
                  setFloorFilter('');
                  setExplorerTowerId('');
                  setExplorerFloorId('');
                }}
                className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
              >
                <option value="">All Projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.project_name}</option>
                ))}
              </select>
            </div>

            {/* Tower Filter */}
            <div>
              <select
                disabled={!projectFilter}
                value={towerFilter}
                onChange={(e) => { setTowerFilter(e.target.value); setFloorFilter(''); }}
                className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">All Towers</option>
                {filteredTowersForDropdown.map(t => (
                  <option key={t.id} value={t.id}>{t.tower_name}</option>
                ))}
              </select>
            </div>

            {/* Floor Filter */}
            <div>
              <select
                disabled={!towerFilter}
                value={floorFilter}
                onChange={(e) => setFloorFilter(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">All Floors</option>
                {filteredFloorsForDropdown.map(f => (
                  <option key={f.id} value={f.id}>{f.floor_name || `Floor ${f.floor_number}`}</option>
                ))}
              </select>
            </div>

            {/* Config Filter */}
            <div>
              <select
                value={configFilter}
                onChange={(e) => setConfigFilter(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
              >
                <option value="">All Configs</option>
                {uniqueConfigs.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
              >
                <option value="">All Statuses</option>
                <option value="available">Available</option>
                <option value="hold">Hold</option>
                <option value="booked">Booked</option>
                <option value="sold">Sold</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>

          </div>

          {/* Directory Table Listing */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col">
            {loading ? (
              <div className="py-24 text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-100 border-t-indigo-600 mx-auto mb-4"></div>
                <p className="text-slate-500 font-medium">Loading inventory directory...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3.5 px-6">Unit / Flat</th>
                      <th className="py-3.5 px-6">Project</th>
                      <th className="py-3.5 px-6">Tower</th>
                      <th className="py-3.5 px-6">Floor</th>
                      <th className="py-3.5 px-6">Configuration</th>
                      <th className="py-3.5 px-6">Carpet Area</th>
                      <th className="py-3.5 px-6">Status</th>
                      <th className="py-3.5 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInventory.length > 0 ? (
                      filteredInventory.map((item) => {
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-4 px-6 font-bold text-slate-900">{item.unit_number}</td>
                            <td className="py-4 px-6 text-sm text-slate-600 font-semibold">{getProjectName(item.project_id)}</td>
                            <td className="py-4 px-6 text-sm text-slate-600">{getTowerName(item.tower_id)}</td>
                            <td className="py-4 px-6 text-sm text-slate-850 font-semibold">{getFloorName(item.floor_id)}</td>
                            <td className="py-4 px-6 text-sm text-slate-700 font-medium">{item.configuration || 'N/A'}</td>
                            <td className="py-4 px-6 text-sm text-slate-600">
                              {item.carpet_area ? `${item.carpet_area} sq.ft` : 'N/A'}
                            </td>
                            <td className="py-4 px-6">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                                item.status.toLowerCase() === 'available' ? 'bg-emerald-50 text-emerald-700' :
                                item.status.toLowerCase() === 'booked' ? 'bg-blue-50 text-blue-700' :
                                item.status.toLowerCase() === 'hold' ? 'bg-indigo-50 text-indigo-700' :
                                item.status.toLowerCase() === 'blocked' ? 'bg-slate-100 text-slate-600' :
                                'bg-rose-50 text-rose-700'
                              }`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="flex items-center justify-end space-x-2">
                                <button
                                  onClick={() => setSelectedUnit(item)}
                                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                                >
                                  View
                                </button>
                                {isAdmin && (
                                  <button
                                    onClick={() => openEditUnitModal(item)}
                                    className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                                    title="Edit Unit"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {isSuperAdmin && (
                                  <button
                                    onClick={() => handleDeleteUnit(item)}
                                    className="p-1.5 border border-slate-200 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                                    title="Delete Unit"
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
                        <td colSpan={8} className="py-24 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center space-y-3">
                            <div className="bg-slate-50 p-4 rounded-full text-slate-300">
                              <Home className="h-8 w-8" />
                            </div>
                            <p className="text-slate-500 font-bold text-sm">No Inventory Records Found</p>
                            <p className="text-xs text-slate-400 max-w-sm">
                              Create unit records, assign towers and floors, and track availability statuses.
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Hierarchy Explorer Drilldown Map View */
        <div className="space-y-4">
          {!projectFilter ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl py-24 text-center text-slate-400">
              <div className="flex flex-col items-center justify-center space-y-3 max-w-md mx-auto">
                <div className="bg-white p-4 rounded-full text-indigo-500 border border-slate-100 shadow-sm">
                  <MapIcon className="h-8 w-8" />
                </div>
                <h4 className="font-bold text-slate-800 text-sm">Hierarchy Explorer Inactive</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Please select an active project in the toolbar filter dropdown to view its towers, floors, and flats.
                </p>
              </div>
            </div>
          ) : (() => {
            const projectTowers = towers.filter(t => t.project_id === projectFilter);
            const activeTower = projectTowers.find(t => t.id === explorerTowerId) || projectTowers[0];
            const activeTowerFloors = floors.filter(f => f.tower_id === (activeTower?.id || ''));
            const activeFloorUnits = inventoryList
              .filter(u => u.tower_id === (activeTower?.id || '') && u.floor_id === explorerFloorId)
              .sort((a, b) => unitNumberCollator.compare(a.unit_number, b.unit_number));
            
            return (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Towers List Side Column */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Towers ({projectTowers.length})</h4>
                  {projectTowers.length > 0 ? (
                    <div className="space-y-2">
                      {projectTowers.map(t => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setExplorerTowerId(t.id);
                            const firstFloor = floors.find(f => f.tower_id === t.id);
                            setExplorerFloorId(firstFloor?.id || '');
                          }}
                          className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-semibold flex items-center justify-between transition-all ${
                            explorerTowerId === t.id
                              ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 shadow-sm'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span>{t.tower_name}</span>
                          <span className="text-xxs font-bold text-slate-400">{t.tower_code || 'TWR'}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">No towers configured.</p>
                  )}
                </div>

                {/* Floors list and Units Explorer Area */}
                <div className="md:col-span-3 space-y-6">
                  {/* Floor Level horizontal tab chooser */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Floors in {activeTower?.tower_name || 'Tower'}</h4>
                    {activeTowerFloors.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {activeTowerFloors.map(f => (
                          <button
                            key={f.id}
                            onClick={() => setExplorerFloorId(f.id)}
                            className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all focus:outline-none ${
                              explorerFloorId === f.id
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-600/10'
                                : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            {f.floor_name || `Floor ${f.floor_number}`}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No floors added to this tower yet.</p>
                    )}
                  </div>

                  {/* Units rendering Grid */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Units Map ({activeFloorUnits.length})
                      </h4>
                      <div className="flex items-center space-x-2 text-xxs font-semibold">
                        <span className="inline-block w-2.5 h-2.5 bg-emerald-100 border border-emerald-300 rounded"></span>
                        <span className="text-slate-500 mr-2">Available</span>
                        <span className="inline-block w-2.5 h-2.5 bg-indigo-100 border border-indigo-300 rounded"></span>
                        <span className="text-slate-500 mr-2">Held</span>
                        <span className="inline-block w-2.5 h-2.5 bg-blue-100 border border-blue-300 rounded"></span>
                        <span className="text-slate-500">Booked</span>
                      </div>
                    </div>

                    {activeFloorUnits.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {activeFloorUnits.map(unit => {
                          const statusLower = unit.status.toLowerCase();
                          return (
                            <button
                              key={unit.id}
                              onClick={() => setSelectedUnit(unit)}
                              className={`p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.01] hover:shadow-sm ${
                                statusLower === 'available' ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950 hover:bg-emerald-50' :
                                statusLower === 'hold' ? 'bg-indigo-50/50 border-indigo-200 text-indigo-950 hover:bg-indigo-50' :
                                statusLower === 'booked' ? 'bg-blue-50/50 border-blue-200 text-blue-950 hover:bg-blue-50' :
                                statusLower === 'blocked' ? 'bg-slate-50 border-slate-200 text-slate-700' :
                                'bg-rose-50/50 border-rose-200 text-rose-950'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <span className="text-sm font-bold">{unit.unit_number}</span>
                                <span className="text-xxs font-semibold uppercase">{unit.configuration || 'N/A'}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-12 text-center text-slate-400">
                        <Home className="h-6 w-6 mx-auto mb-2 text-slate-300" />
                        <p className="text-xs">No units configured for this floor.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ADD / EDIT UNIT MODAL */}
      {isUnitModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsUnitModalOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">{editingUnit ? 'Edit Unit' : 'Add Unit'}</span>
              <button type="button" onClick={() => setIsUnitModalOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUnitSubmit}>
              {(() => {
                const hasActiveBooking = !!(editingUnit && ['booked', 'sold'].includes(editingUnit.status.toLowerCase()));
                return (
                  <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-left">
                    {unitError && (
                      <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
                        <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                        <span className="text-sm font-semibold leading-tight">{unitError}</span>
                      </div>
                    )}

                    {hasActiveBooking && (
                      <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2.5 rounded-xl text-xs font-semibold">
                        ⚠️ This unit cannot be moved or renumbered because it has an active booking.
                      </div>
                    )}

                    {/* Project Select */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Project *</label>
                      <select
                        required
                        disabled={!!editingUnit || hasActiveBooking}
                        value={selectedProjectId}
                        onChange={(e) => handleFormProjectChange(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all disabled:opacity-60"
                      >
                        <option value="">Choose Project...</option>
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>{p.project_name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Tower Select (Cascading) */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Tower *</label>
                        {selectedProjectId && !hasActiveBooking && (
                          <button
                            type="button"
                            onClick={openNewTowerModal}
                            className="text-xxs font-bold text-indigo-600 hover:underline"
                          >
                            + Add Tower
                          </button>
                        )}
                      </div>
                      <select
                        required
                        disabled={!selectedProjectId || !!editingUnit || hasActiveBooking}
                        value={selectedTowerId}
                        onChange={(e) => handleFormTowerChange(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="">Choose Tower...</option>
                        {formAvailableTowers.map(t => (
                          <option key={t.id} value={t.id}>{t.tower_name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Floor Select (Cascading) */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Floor *</label>
                        {selectedTowerId && !hasActiveBooking && (
                          <button
                            type="button"
                            onClick={openNewFloorModal}
                            className="text-xxs font-bold text-indigo-600 hover:underline"
                          >
                            + Add Floor
                          </button>
                        )}
                      </div>
                      <select
                        required
                        value={selectedFloorId}
                        disabled={!selectedTowerId || !!editingUnit || hasActiveBooking}
                        onChange={(e) => setSelectedFloorId(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="">Choose Floor...</option>
                        {formAvailableFloors.map(f => (
                          <option key={f.id} value={f.id}>{f.floor_name || `Floor ${f.floor_number}`}</option>
                        ))}
                      </select>
                    </div>

                    {/* Unit number */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Unit / Flat Number *</label>
                      <input
                        type="text"
                        required
                        disabled={hasActiveBooking}
                        placeholder="e.g. 102"
                        value={unitNumber}
                        onChange={(e) => setUnitNumber(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all disabled:opacity-60"
                      />
                    </div>

                    {/* Config */}
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Configuration</label>
                        <select
                          value={unitConfig}
                          onChange={(e) => setUnitConfig(e.target.value)}
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
                    </div>

                    {/* Areas */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xxs font-bold text-slate-700 uppercase tracking-wider mb-1">Carpet (sq.ft)</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="650"
                          value={unitCarpet}
                          onChange={(e) => setUnitCarpet(e.target.value)}
                          className="block w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs focus:bg-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xxs font-bold text-slate-700 uppercase tracking-wider mb-1">Built-up (sq.ft)</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="850"
                          value={unitBuiltUp}
                          onChange={(e) => setUnitBuiltUp(e.target.value)}
                          className="block w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs focus:bg-white focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Status */}
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Status *</label>
                        <select
                          value={unitStatus}
                          onChange={(e) => setUnitStatus(e.target.value)}
                          className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                        >
                          <option value="available">Available</option>
                          <option value="hold">Hold</option>
                          <option value="booked">Booked</option>
                          <option value="sold">Sold</option>
                          <option value="blocked">Blocked</option>
                        </select>
                      </div>
                    </div>

                    {/* Hold details input (rendered if status === hold) */}
                    {unitStatus === 'hold' && (
                      <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-2xl space-y-3">
                        <h4 className="text-xs font-bold text-indigo-900 uppercase">Hold Details Configurations</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xxs font-bold text-slate-700 uppercase">Hold Date</label>
                            <input
                              type="date"
                              value={unitHoldDate}
                              onChange={(e) => setUnitHoldDate(e.target.value)}
                              className="block w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xxs font-bold text-slate-700 uppercase">Hold Expiry</label>
                            <input
                              type="date"
                              value={unitHoldExpiry}
                              onChange={(e) => setUnitHoldExpiry(e.target.value)}
                              className="block w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xxs font-bold text-slate-700 uppercase">Hold Client / Lead</label>
                          <select
                            value={unitHoldLeadId}
                            onChange={(e) => setUnitHoldLeadId(e.target.value)}
                            className="block w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs"
                          >
                            <option value="">Select Lead...</option>
                            {leadsList.map(l => (
                              <option key={l.id} value={l.id}>{l.customer_name || 'Unnamed Lead'}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Remarks */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Remarks</label>
                      <textarea
                        placeholder="Any comments, constraints..."
                        rows={2}
                        value={unitRemarks}
                        onChange={(e) => setUnitRemarks(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Modal Footer */}
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

      {/* ADD TOWER MODAL */}
      {isTowerModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsTowerModalOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Create Tower</span>
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
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Project *</label>
                  <select
                    required
                    value={towerProjId}
                    onChange={(e) => setTowerProjId(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                  >
                    <option value="">Select Project...</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.project_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Tower Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Tower A"
                    value={towerName}
                    onChange={(e) => setTowerName(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Tower Code</label>
                  <input
                    type="text"
                    placeholder="e.g. TWR-A"
                    value={towerCode}
                    onChange={(e) => setTowerCode(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Total Floors</label>
                    <input
                      type="number"
                      placeholder="10"
                      value={towerFloors}
                      onChange={(e) => setTowerFloors(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Units / Floor</label>
                    <input
                      type="number"
                      placeholder="4"
                      value={towerUnitsPerFloor}
                      onChange={(e) => setTowerUnitsPerFloor(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Tower Status *</label>
                  <select
                    value={towerStatus}
                    onChange={(e) => setTowerStatus(e.target.value)}
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
                  {towerSubmitting ? 'Saving...' : 'Save Tower'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD FLOOR MODAL */}
      {isFloorModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsFloorModalOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Create Floor</span>
              <button type="button" onClick={() => setIsFloorModalOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleFloorSubmit}>
              <div className="p-6 space-y-4 text-left">
                {floorError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3.5 py-2.5 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold leading-tight">{floorError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Project *</label>
                  <select
                    required
                    value={floorProjId}
                    onChange={(e) => setFloorProjId(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                  >
                    <option value="">Select Project...</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.project_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Tower *</label>
                  <select
                    required
                    value={floorTowerId}
                    disabled={!floorProjId}
                    onChange={(e) => setFloorTowerId(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all disabled:opacity-60"
                  >
                    <option value="">Select Tower...</option>
                    {towers.filter(t => t.project_id === floorProjId).map(t => (
                      <option key={t.id} value={t.id}>{t.tower_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Floor Number *</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 1"
                    value={floorNumberInput}
                    onChange={(e) => setFloorNumberInput(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Floor Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Floor 1, Ground Floor"
                    value={floorNameInput}
                    onChange={(e) => setFloorNameInput(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Total Units / Floor</label>
                  <input
                    type="number"
                    placeholder="4"
                    value={floorTotalUnits}
                    onChange={(e) => setFloorTotalUnits(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFloorModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={floorSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md disabled:opacity-50 transition-all focus:outline-none"
                >
                  {floorSubmitting ? 'Saving...' : 'Save Floor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK ADD UNITS MODAL */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsBulkModalOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Bulk Generate Inventory Units</span>
              <button type="button" onClick={() => setIsBulkModalOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleBulkSubmit}>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-left">
                {bulkError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold leading-tight">{bulkError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Project *</label>
                    <select
                      required
                      value={bulkProjId}
                      onChange={(e) => { setBulkProjId(e.target.value); setBulkTowerId(''); }}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:outline-none transition-all"
                    >
                      <option value="">Choose Project...</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.project_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Tower *</label>
                    <select
                      required
                      value={bulkTowerId}
                      disabled={!bulkProjId}
                      onChange={(e) => setBulkTowerId(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:outline-none transition-all disabled:opacity-60"
                    >
                      <option value="">Choose Tower...</option>
                      {towers.filter(t => t.project_id === bulkProjId).map(t => (
                        <option key={t.id} value={t.id}>{t.tower_name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xxs font-bold text-slate-700 uppercase mb-1">From Floor *</label>
                    <input
                      type="number"
                      required
                      value={bulkFromFloor}
                      onChange={(e) => setBulkFromFloor(e.target.value)}
                      className="block w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-slate-50 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xxs font-bold text-slate-700 uppercase mb-1">To Floor *</label>
                    <input
                      type="number"
                      required
                      value={bulkToFloor}
                      onChange={(e) => setBulkToFloor(e.target.value)}
                      className="block w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-slate-50 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xxs font-bold text-slate-700 uppercase mb-1">Units / Floor *</label>
                    <input
                      type="number"
                      required
                      value={bulkUnitsPerFloor}
                      onChange={(e) => setBulkUnitsPerFloor(e.target.value)}
                      className="block w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-slate-50 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Configuration</label>
                    <select
                      value={bulkConfig}
                      onChange={(e) => setBulkConfig(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm"
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
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xxs font-bold text-slate-700 uppercase mb-1">Carpet (sq.ft)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={bulkCarpet}
                      onChange={(e) => setBulkCarpet(e.target.value)}
                      className="block w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-slate-50 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xxs font-bold text-slate-700 uppercase mb-1">Built-up (sq.ft)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={bulkBuiltUp}
                      onChange={(e) => setBulkBuiltUp(e.target.value)}
                      className="block w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-slate-50 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xxs font-bold text-slate-700 uppercase mb-1">Status</label>
                    <select
                      value={bulkStatus}
                      onChange={(e) => setBulkStatus(e.target.value)}
                      className="block w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-slate-50 text-xs focus:outline-none"
                    >
                      <option value="available">Available</option>
                      <option value="hold">Hold</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={handleBulkPreview}
                    className="px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold rounded-xl text-xs hover:bg-indigo-100 transition-all focus:outline-none"
                  >
                    Preview Generated Units
                  </button>
                  <span className="text-xs text-slate-500 font-semibold">
                    Net Create: {bulkPreview.filter(p => !p.isDuplicate).length} / {bulkPreview.length} units
                  </span>
                </div>

                {bulkPreview.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[160px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 sticky top-0 text-slate-400 font-bold uppercase border-b border-slate-100">
                        <tr>
                          <th className="p-2">Floor</th>
                          <th className="p-2">Unit</th>
                          <th className="p-2 text-right">Duplicate?</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                        {bulkPreview.map((p, idx) => (
                          <tr key={idx} className={p.isDuplicate ? 'bg-rose-50/50' : 'hover:bg-slate-50/30'}>
                            <td className="p-2">Floor {p.floorNumber}</td>
                            <td className="p-2 font-bold text-slate-900">{p.unitNumber}</td>
                            <td className="p-2 text-right">
                              {p.isDuplicate ? (
                                <span className="text-rose-600 font-bold">Duplicate (Will Skip)</span>
                              ) : (
                                <span className="text-emerald-600 font-bold">Ready</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkSubmitting || bulkPreview.filter(p => !p.isDuplicate).length === 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md disabled:opacity-50 transition-all focus:outline-none"
                >
                  {bulkSubmitting ? 'Generating...' : `Create ${bulkPreview.filter(p => !p.isDuplicate).length} Units`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW UNIT DETAILS DRAWER / MODAL */}
      {selectedUnit && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedUnit(null)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-950 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Home className="h-5 w-5 text-indigo-400" />
                <span className="font-bold tracking-tight">Unit Details View</span>
              </div>
              <button onClick={() => setSelectedUnit(null)} className="p-1 rounded-lg text-slate-400 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-left max-h-[70vh] overflow-y-auto">
              {(() => {
                const parsed = parseNotes(selectedUnit.notes);
                const relatedBooking = bookings.find(b => b.inventory_id === selectedUnit.id);
                return (
                  <>
                    <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                      <div>
                        <h4 className="text-xl font-extrabold text-slate-900">Flat: {selectedUnit.unit_number}</h4>
                        <p className="text-xs text-slate-400 mt-1">Project Code Ref: {getProjectName(selectedUnit.project_id)}</p>
                      </div>
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        selectedUnit.status.toLowerCase() === 'available' ? 'bg-emerald-50 text-emerald-700' :
                        selectedUnit.status.toLowerCase() === 'booked' ? 'bg-blue-50 text-blue-700' :
                        selectedUnit.status.toLowerCase() === 'hold' ? 'bg-indigo-50 text-indigo-700' :
                        selectedUnit.status.toLowerCase() === 'blocked' ? 'bg-amber-50 text-amber-700' :
                        'bg-rose-50 text-rose-700'
                      }`}>
                        {selectedUnit.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Tower Reference</span>
                        <span className="text-sm font-semibold text-slate-800">{getTowerName(selectedUnit.tower_id)}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Floor Level</span>
                        <span className="text-sm font-semibold text-slate-800">{getFloorName(selectedUnit.floor_id)}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">BHK Configuration</span>
                        <span className="text-sm font-semibold text-slate-800">{selectedUnit.configuration || 'N/A'}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Carpet Area</span>
                        <span className="text-sm font-semibold text-slate-800">
                          {selectedUnit.carpet_area ? `${selectedUnit.carpet_area} sq.ft` : 'N/A'}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Built-Up Area</span>
                        <span className="text-sm font-semibold text-slate-800">
                          {selectedUnit.built_up_area ? `${selectedUnit.built_up_area} sq.ft` : 'N/A'}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Saleable Area</span>
                        <span className="text-sm font-semibold text-slate-800">
                          {selectedUnit.saleable_area ? `${selectedUnit.saleable_area} sq.ft` : 'N/A'}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Facing Orientation</span>
                        <span className="text-sm font-semibold text-slate-800">{selectedUnit.facing || 'N/A'}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">View</span>
                        <span className="text-sm font-semibold text-slate-800">{parsed.view || 'N/A'}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Parking</span>
                        <span className="text-sm font-semibold text-slate-800">{parsed.parking || 'N/A'}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Possession Date</span>
                        <span className="text-sm font-semibold text-slate-800">{parsed.possession_date || 'N/A'}</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4">
                      <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-2">Remarks / Notes</span>
                      <div className="bg-slate-50 p-4 border border-slate-100 rounded-xl text-sm text-slate-700 leading-relaxed max-h-[100px] overflow-y-auto">
                        {parsed.remarks || 'No remarks recorded.'}
                      </div>
                    </div>

                    {/* Hold Details view if unit is on hold */}
                    {selectedUnit.status.toLowerCase() === 'hold' && parsed.hold_date && (
                      <div className="border-t border-slate-100 pt-4 bg-amber-50/40 border border-amber-200/50 p-4 rounded-xl space-y-2">
                        <h5 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center space-x-1">
                          <span>⚠️ Temporary Hold Record Active</span>
                        </h5>
                        <div className="grid grid-cols-2 gap-3 text-xs text-slate-700">
                          <div>Hold Date: <strong>{parsed.hold_date}</strong></div>
                          <div>Hold Expiry: <strong>{parsed.hold_expiry || 'N/A'}</strong></div>
                          <div className="col-span-2">
                            Assigned Lead: <strong>{leadsMap.get(parsed.hold_lead_id || '') || 'Unnamed Lead'}</strong>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Booking metadata mapping if unit is booked / sold */}
                    {relatedBooking && (
                      <div className="border-t border-slate-100 pt-4 bg-indigo-50/30 border border-indigo-100/50 p-4 rounded-xl space-y-3">
                        <h5 className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center space-x-1">
                          <CheckCircle className="h-4 w-4 text-indigo-600" />
                          <span>Active Client Booking Link Found</span>
                        </h5>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="flex items-center space-x-1 text-slate-700">
                            <User className="h-3.5 w-3.5 text-slate-400" />
                            <span>Client: <strong>{leadsMap.get(relatedBooking.lead_id || '') || 'Unnamed Lead'}</strong></span>
                          </div>
                          <div className="flex items-center space-x-1 text-slate-700">
                            <IndianRupee className="h-3.5 w-3.5 text-slate-400" />
                            <span>Consideration: <strong>₹{(relatedBooking.booking_amount || 0).toLocaleString('en-IN')}</strong></span>
                          </div>
                          <div className="flex items-center space-x-1 text-slate-700">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            <span>Date: <strong>{relatedBooking.booking_date ? new Date(relatedBooking.booking_date).toLocaleDateString('en-IN') : 'N/A'}</strong></span>
                          </div>
                          <span className={`inline-flex self-start px-2 py-0.5 rounded text-xxs font-bold uppercase tracking-wider ${
                            relatedBooking.status?.toLowerCase() === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'
                          }`}>
                            Booking: {relatedBooking.status || 'draft'}
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
              <button
                onClick={() => setSelectedUnit(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-all focus:outline-none"
              >
                Close details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
