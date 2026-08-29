import { useMemo, useRef, useState } from 'react';
import { Download, ExternalLink, FolderOpen, Link2, Loader2, Pencil, Sparkles, Trash2, Upload } from 'lucide-react';
import Button from '../../../components/common/Button';
import Card, { CardHeader } from '../../../components/common/Card';
import { DomainChip } from '../../../components/common/DomainChip';
import EmptyState from '../../../components/common/EmptyState';
import { SkeletonGrid } from '../../../components/common/Skeleton';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import ResourceCard from '../../../components/student/resources/ResourceCard';
import EditResourceDialog from '../../../components/student/resources/EditResourceDialog';
import QuizRunner from '../../../components/student/quiz/QuizRunner';
import { RESOURCE_TYPES } from '../../../constants/ui';
import { useResourceLibraryData } from '../../../hooks/useResourceLibraryData';
import { addLinkResource, deleteResource, downloadResource, logResourceView, openResourceFile, uploadResource } from '../../../services/api/resourceService';
import { setPrefillPrompt } from '../../../utils/aiPrefill';

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
].join(',');

export default function ResourcesPage({ onNavigate }) {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { data, loading } = useResourceLibraryData(refreshVersion);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [subjectId, setSubjectId] = useState('all');
  const [selected, setSelected] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [quizRequest, setQuizRequest] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [addingLink, setAddingLink] = useState(false);
  const [editingFile, setEditingFile] = useState(null);
  const fileInputRef = useRef(null);
  const confirm = useConfirm();
  const toast = useToast();
  const resources = data?.resources ?? [];
  const subjects = data?.subjects ?? [];
  const recentlyOpened = data?.recentlyOpened ?? [];
  const popular = data?.popular ?? [];
  const recommended = data?.recommended ?? [];

  const filtered = useMemo(() => (resources ?? []).filter((file) => (
    (type === 'all' || file.type === type) &&
    (subjectId === 'all' || file.subjects?.some((subject) => String(subject.id) === subjectId)) &&
    (!search || file.title.toLowerCase().includes(search.toLowerCase()))
  )), [resources, search, type, subjectId]);

  const openResource = async (file) => {
    if (file.external_url) {
      await logResourceView(file.id).catch(() => {});
      window.open(file.external_url, '_blank', 'noopener,noreferrer');
      setRefreshVersion((version) => version + 1);
      return;
    }

    if (file.file_path) {
      try {
        await openResourceFile(file.id, file.title, file.type);
        await logResourceView(file.id).catch(() => {});
        setRefreshVersion((version) => version + 1);
      } catch (error) {
        toast.error(error.message || 'Could not open this file.');
      }
    }
  };

  const handleDownload = async (file) => {
    setDownloading(true);
    try {
      await downloadResource(file.id, file.title);
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      toast.error(error.message || 'Could not download this file.');
    } finally {
      setDownloading(false);
    }
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    setUploadError('');
    try {
      await uploadResource(file, subjectId !== 'all' ? subjectId : null);
      toast.success('Resource uploaded and processed.');
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      setUploadError(error.message || 'Could not upload that file.');
      toast.error(error.message || 'Could not upload that file.');
    } finally {
      setUploading(false);
    }
  };

  const handleAddLink = async () => {
    if (!linkUrl.trim()) return;
    setAddingLink(true);
    setUploadError('');
    try {
      await addLinkResource(linkUrl.trim(), linkTitle.trim(), subjectId !== 'all' ? subjectId : null);
      toast.success('Link added and processed.');
      setLinkUrl('');
      setLinkTitle('');
      setShowLinkForm(false);
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      setUploadError(error.message || 'Could not add that link.');
      toast.error(error.message || 'Could not add that link.');
    } finally {
      setAddingLink(false);
    }
  };

  const handleDeleteResource = async (file) => {
    const ok = await confirm({
      title: 'Delete this resource?',
      message: `"${file.title}" and its AI analysis will be permanently removed. This can't be undone.`,
    });
    if (!ok) return;

    try {
      await deleteResource(file.id);
      toast.success('Resource deleted.');
      if (selected?.id === file.id) setSelected(null);
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      toast.error(error.message || 'Could not delete that resource.');
    }
  };

  const handleAskAila = (file) => {
    const prompt = file.is_analyzed
      ? `Can you summarize "${file.title}" and highlight the key points?`
      : `Can you help me understand the resource "${file.title}"?`;
    setPrefillPrompt(prompt, file.is_analyzed ? file.id : null);
    onNavigate?.('assistant');
  };

  return (
    <div className="p-5 lg:p-8 max-w-6xl mx-auto animate-fadeUp">
      <div className="grid lg:grid-cols-[200px_1fr] gap-6">
        <Card className="h-fit lg:sticky lg:top-20 min-w-0">
          <div className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-2 px-1">Subjects</div>
          <div className="flex lg:flex-col gap-1 flex-wrap">
            <FilterPill active={subjectId === 'all'} onClick={() => setSubjectId('all')} label="All materials" count={resources.length} />
            {subjects.map((subject) => {
              const count = resources.filter((file) => file.subjects?.some((item) => item.id === subject.id)).length;
              return <FilterPill key={subject.id} active={subjectId === String(subject.id)} onClick={() => setSubjectId(String(subject.id))} label={subject.name} count={count} color={subject.color} />;
            })}
          </div>
        </Card>

        <div className="flex flex-col gap-4 min-w-0">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 flex items-center gap-2 bg-white border border-ink-100 focus-within:border-primary-300 rounded-xl px-3.5 py-2.5">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search resources by title..."
                className="flex-1 outline-none text-sm bg-transparent placeholder:text-ink-400"
              />
            </div>
            <input ref={fileInputRef} type="file" accept={ACCEPTED_FILE_TYPES} onChange={handleFileChange} className="hidden" />
            <Button
              variant="outline"
              icon={<Link2 size={15} />}
              onClick={() => setShowLinkForm((current) => !current)}
            >
              Add link
            </Button>
            <Button
              icon={uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              onClick={handleUploadClick}
              disabled={uploading}
            >
              {uploading ? 'Processing...' : 'Upload File'}
            </Button>
          </div>

          {showLinkForm && (
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center bg-ink-50/60 border border-ink-100 rounded-xl p-3.5">
              <input
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="https://example.com/article"
                className="flex-1 bg-white border border-ink-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-300"
              />
              <input
                value={linkTitle}
                onChange={(event) => setLinkTitle(event.target.value)}
                placeholder="Title (optional)"
                className="flex-1 bg-white border border-ink-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-300"
              />
              <Button size="sm" onClick={handleAddLink} disabled={addingLink || !linkUrl.trim()}>
                {addingLink ? 'Adding...' : 'Add'}
              </Button>
            </div>
          )}

          {uploadError && <p className="text-xs text-rose-600 -mt-2">{uploadError}</p>}

          <div className="flex gap-2 flex-wrap">
            {RESOURCE_TYPES.map((resourceType) => (
              <button
                key={resourceType}
                onClick={() => setType(resourceType)}
                className={[
                  'text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors capitalize',
                  type === resourceType ? 'bg-primary border-primary text-white' : 'bg-white border-ink-100 text-ink-600 hover:border-primary-300',
                ].join(' ')}
              >
                {resourceType}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-ink-400 font-medium px-0.5">
            <span>Showing {filtered.length} file{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {loading ? (
            <SkeletonGrid count={4} />
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {filtered.length ? filtered.map((file) => (
                <ResourceCard
                  key={file.id}
                  file={file}
                  selected={selected?.id === file.id}
                  onSelect={setSelected}
                  onOpen={openResource}
                  onDownload={handleDownload}
                  onEdit={setEditingFile}
                  onDelete={handleDeleteResource}
                />
              )) : (
                <div className="col-span-2">
                  {resources.length === 0 ? (
                    <EmptyState
                      icon={FolderOpen}
                      title="No resources uploaded"
                      message="Upload PDFs, Documents, PowerPoint files, Images or Links."
                      action={<Button size="sm" icon={<Upload size={14} />} onClick={handleUploadClick}>Upload File</Button>}
                    />
                  ) : (
                    <EmptyState title="No resources found" message="Adjust your search or filters to see resources here." />
                  )}
                </div>
              )}
            </div>
          )}

          {(recentlyOpened.length > 0 || popular.length > 0 || recommended.length > 0) && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
              {recommended.length > 0 && (
                <Card>
                  <CardHeader title="Recommended for you" />
                  <div className="flex flex-col gap-2">
                    {recommended.map((item) => (
                      <div key={item.id} className="text-sm text-ink-600 truncate">{item.title}</div>
                    ))}
                  </div>
                </Card>
              )}
              {recentlyOpened.length > 0 && (
                <Card>
                  <CardHeader title="Recently opened" />
                  <div className="flex flex-col gap-2">
                    {recentlyOpened.map((item) => (
                      <div key={item.id} className="text-sm text-ink-600 truncate">{item.title}</div>
                    ))}
                  </div>
                </Card>
              )}
              {popular.length > 0 && (
                <Card>
                  <CardHeader title="Popular resources" />
                  <div className="flex flex-col gap-2">
                    {popular.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-sm text-ink-600">
                        <span className="truncate">{item.title}</span>
                        <span className="text-xs text-ink-400 flex-shrink-0">{item.view_count} views</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <Card className="mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-800">{selected.title}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <DomainChip subject={selected.subjects?.[0]} />
                <span className="text-xs text-ink-400">{selected.category_name ?? selected.type}</span>
                {selected.ai_difficulty && (
                  <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full capitalize bg-primary-50 text-primary">{selected.ai_difficulty}</span>
                )}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap flex-shrink-0">
              <Button variant="outline" size="sm" icon={<ExternalLink size={14} />} onClick={() => openResource(selected)}>Open</Button>
              {selected.file_path && (
                <Button variant="outline" size="sm" icon={<Download size={14} />} disabled={downloading} onClick={() => handleDownload(selected)}>
                  {downloading ? 'Downloading...' : 'Download'}
                </Button>
              )}
              <Button size="sm" icon={<Sparkles size={14} />} onClick={() => handleAskAila(selected)}>Ask AILA</Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuizRequest({ sourceType: 'resource', sourceId: selected.id, topic: selected.ai_topic || selected.title })}
              >
                Generate Quiz
              </Button>
              <Button variant="outline" size="sm" icon={<Pencil size={14} />} onClick={() => setEditingFile(selected)}>Edit</Button>
              <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => handleDeleteResource(selected)}>Delete</Button>
            </div>
          </div>

          {selected.ai_summary && (
            <div className="mt-4 pt-4 border-t border-ink-100">
              <p className="text-sm text-ink-600 leading-relaxed">{selected.ai_summary}</p>
              {selected.ai_keywords?.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-2.5">
                  {selected.ai_keywords.map((keyword) => (
                    <span key={keyword} className="text-[0.7rem] font-medium px-2 py-0.5 rounded-full bg-ink-50 text-ink-500">{keyword}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {quizRequest && <QuizRunner request={quizRequest} onClose={() => setQuizRequest(null)} />}

      {editingFile && (
        <EditResourceDialog
          file={editingFile}
          subjects={subjects}
          onClose={() => setEditingFile(null)}
          onSaved={() => {
            setEditingFile(null);
            setRefreshVersion((version) => version + 1);
          }}
        />
      )}
    </div>
  );
}

function FilterPill({ active, onClick, label, count, color = '#64748B' }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={[
        'flex items-center gap-2 text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors min-w-0 max-w-full lg:w-full',
        active ? 'bg-primary-50 text-primary font-semibold' : 'text-ink-600 hover:bg-ink-50',
      ].join(' ')}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="flex-1 min-w-0 truncate">{label}</span>
      <span className="text-[0.65rem] text-ink-400 bg-ink-50 px-1.5 rounded-full flex-shrink-0">{count}</span>
    </button>
  );
}
